import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/api/client';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSession } from '@/auth/session';
import { Card, ErrorState, LoadingCard, LoadingState, PageTitle, PrimaryButton, Screen, SecondaryButton, styles } from '@/components/ui';
import { colors } from '@/theme';

type ChatKind = 'channel' | 'group' | 'direct';
type ChatConversation = { id: string; name?: string; groupName?: string; description?: string; memberCount?: number; unread?: number; unreadCount?: number; lastMessage?: { body?: string; senderName?: string } };
type DirectConversation = { user: { id: string; full_name?: string; role?: string; presenceStatus?: string }; lastMessage?: string; unread?: number };
type ChatMessage = { id: string; message_text?: string; created_at?: string; sender_id?: string; sender_name?: string; sender?: { full_name?: string }; attachment_name?: string };
type PendingAttachment = { name: string; mime: string; size: number; content: string };

function conversationTitle(item: Partial<ChatConversation>) { return item.name || item.groupName || 'Conversation'; }

function formatMessageTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TeamChatScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ChatKind>('channel');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const canChat = ['super_admin', 'sales_manager', 'sales_agent', 'project_manager'].includes(String(user?.role || '').toLowerCase());
  const canManageGroups = ['super_admin', 'sales_manager'].includes(String(user?.role || '').toLowerCase());
  const channelsQuery = useQuery({ queryKey: ['chat-channels'], queryFn: ({ signal }) => apiFetch<{ data: ChatConversation[] }>('/api/chat/channels', { signal }), enabled: Boolean(user) && canChat, refetchInterval: canChat ? 15_000 : false });
  const groupsQuery = useQuery({ queryKey: ['chat-groups'], queryFn: ({ signal }) => apiFetch<{ data: ChatConversation[] }>('/api/chat/groups', { signal }), enabled: Boolean(user) && canChat, refetchInterval: canChat ? 15_000 : false });
  const directQuery = useQuery({ queryKey: ['chat-direct'], queryFn: ({ signal }) => apiFetch<{ data: DirectConversation[] }>('/api/chat/direct', { signal }), enabled: Boolean(user) && canChat, refetchInterval: canChat ? 15_000 : false });
  const chatUsersQuery = useQuery({ queryKey: ['chat-users'], queryFn: ({ signal }) => apiFetch<{ data: Array<{ id: string; full_name?: string; initials?: string; role?: string }> }>('/api/chat/users', { signal }), enabled: Boolean(user) && canManageGroups });
  const conversations = useMemo(() => {
    if (kind === 'channel') return channelsQuery.data?.data || [];
    if (kind === 'group') return groupsQuery.data?.data || [];
    return (directQuery.data?.data || []).map<ChatConversation>(item => ({ id: item.user.id, name: item.user.full_name || 'Team member', description: `${item.user.role || 'CRM user'} · ${item.user.presenceStatus || 'Offline'}`, unread: item.unread, lastMessage: { body: item.lastMessage || 'Start a conversation' } }));
  }, [channelsQuery.data?.data, groupsQuery.data?.data, directQuery.data?.data, kind]);
  const activeId = selectedId && conversations.some(item => item.id === selectedId) ? selectedId : conversations[0]?.id;
  const messagesQuery = useQuery({
    queryKey: ['chat-messages', kind, activeId],
    queryFn: ({ signal }) => apiFetch<{ data: ChatMessage[] }>(kind === 'direct' ? `/api/chat/direct/${encodeURIComponent(String(activeId))}/messages` : `/api/chat/${kind === 'channel' ? 'channels' : 'groups'}/${encodeURIComponent(String(activeId))}/messages?markRead=1`, { signal }),
    enabled: Boolean(activeId) && canChat,
    refetchInterval: activeId && canChat ? 10_000 : false
  });

  useEffect(() => {
    if (activeId && selectedId !== activeId) setSelectedId(activeId);
  }, [activeId, selectedId]);

  async function sendMessage() {
    const message = composer.trim();
    const attachment = pendingAttachment;
    if (!activeId || (!message && !attachment)) return;
    setComposer('');
    try {
      await apiFetch(kind === 'direct' ? `/api/chat/direct/${encodeURIComponent(activeId)}/messages` : `/api/chat/${kind === 'channel' ? 'channels' : 'groups'}/${encodeURIComponent(activeId)}/messages`, { method: 'POST', body: JSON.stringify({ message_text: message, ...(attachment ? { attachment_name: attachment.name, attachment_mime: attachment.mime, attachment_size: attachment.size, attachment_content: attachment.content } : {}) }) });
      setPendingAttachment(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['chat-messages', kind, activeId] }), queryClient.invalidateQueries({ queryKey: [kind === 'channel' ? 'chat-channels' : kind === 'group' ? 'chat-groups' : 'chat-direct'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]);
    } catch (error) {
      setComposer(message);
      Alert.alert('Message not sent', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function chooseAttachment() {
    if (attaching) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      if ((asset.size || 0) > 1_500_000) { Alert.alert('File is too large', 'Chat attachments are limited to 1.5 MB.'); return; }
      setAttaching(true);
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = asset.mimeType || 'application/octet-stream';
      setPendingAttachment({ name: asset.name || 'attachment', mime, size: asset.size || 0, content: `data:${mime};base64,${content}` });
    } catch (error) { Alert.alert('Attachment unavailable', error instanceof Error ? error.message : 'Choose another file and try again.'); }
    finally { setAttaching(false); }
  }

  async function createGroup() {
    if (!groupName.trim()) { Alert.alert('Group name required', 'Enter a name before creating the group.'); return; }
    try { await apiFetch('/api/chat/groups', { method: 'POST', body: JSON.stringify({ groupName: groupName.trim(), memberIds: groupMemberIds }) }); setGroupName(''); setGroupMemberIds([]); await queryClient.invalidateQueries({ queryKey: ['chat-groups'] }); Alert.alert('Group created', 'The group is now available to permitted members.'); }
    catch (error) { Alert.alert('Unable to create group', error instanceof Error ? error.message : 'Please try again.'); }
  }

  if (!canChat) return <Screen><ErrorState message="Team Chat is not available for this CRM role." /></Screen>;
  if (channelsQuery.isLoading || groupsQuery.isLoading || directQuery.isLoading) return <LoadingState />;
  if (channelsQuery.isError || groupsQuery.isError || directQuery.isError) return <Screen><ErrorState message="Team Chat could not load. Pull to refresh and try again." onRetry={() => { void Promise.all([channelsQuery.refetch(), groupsQuery.refetch(), directQuery.refetch()]); }} /></Screen>;

  return <Screen refreshing={channelsQuery.isRefetching || groupsQuery.isRefetching || directQuery.isRefetching} onRefresh={() => { void Promise.all([channelsQuery.refetch(), groupsQuery.refetch(), directQuery.refetch(), messagesQuery.refetch()]); }}>
    <PageTitle eyebrow="Workspace" title="Team Chat" copy="Stay aligned with the Aureum team using the same server-backed conversations as the web CRM." />

    <View style={styles.filterRow}>
      <SecondaryButton label={`Channels${channelsQuery.data?.data?.length ? ` · ${channelsQuery.data.data.length}` : ''}`} active={kind === 'channel'} onPress={() => { setKind('channel'); setSelectedId(null); }} />
      <SecondaryButton label={`Groups${groupsQuery.data?.data?.length ? ` · ${groupsQuery.data.data.length}` : ''}`} active={kind === 'group'} onPress={() => { setKind('group'); setSelectedId(null); }} />
      <SecondaryButton label={`Direct${directQuery.data?.data?.length ? ` · ${directQuery.data.data.length}` : ''}`} active={kind === 'direct'} onPress={() => { setKind('direct'); setSelectedId(null); }} />
    </View>

    <Card>
      <View style={styles.sectionHeader}><Text style={styles.rowTitle}>{kind === 'channel' ? 'Channels' : kind === 'group' ? 'Groups' : 'Direct conversations'}</Text><Text style={styles.rowMeta}>{conversations.length} available</Text></View>
      {conversations.length ? <View style={styles.chatConversationList}>{conversations.map(item => <Pressable key={item.id} onPress={() => setSelectedId(item.id)} style={[styles.chatConversation, item.id === activeId && styles.chatConversationActive]}><View style={styles.sectionHeader}><Text style={styles.chatConversationTitle}>{conversationTitle(item)}</Text>{(item.unread ?? item.unreadCount ?? 0) > 0 ? <Text style={styles.badge}>{item.unread ?? item.unreadCount} new</Text> : null}</View><Text style={styles.chatConversationMeta} numberOfLines={1}>{item.lastMessage?.body || item.description || `${item.memberCount || 0} members`}</Text></Pressable>)}</View> : <Text style={styles.copy}>No {kind === 'channel' ? 'channels' : kind === 'group' ? 'groups' : 'direct conversations'} are available for your account.</Text>}
    </Card>

    {canManageGroups && kind === 'group' ? <Card><Text style={styles.rowTitle}>Create group</Text><TextInput value={groupName} onChangeText={setGroupName} placeholder="Group name" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.copy}>Optional members</Text><View style={styles.filterRow}>{(chatUsersQuery.data?.data || []).map(member => { const label = member.full_name || member.initials || 'Member'; const selected = groupMemberIds.includes(member.id); return <SecondaryButton key={member.id} label={label} active={selected} onPress={() => setGroupMemberIds(current => selected ? current.filter(id => id !== member.id) : [...current, member.id])} />; })}</View><PrimaryButton label="Create group" onPress={() => { void createGroup(); }} /></Card> : null}

    <Card>
      <View style={styles.sectionHeader}><Text style={styles.rowTitle}>{activeId ? conversationTitle(conversations.find(item => item.id === activeId) || {}) : 'Conversation'}</Text>{activeId ? <Text style={styles.rowMeta}>{messagesQuery.data?.data?.length || 0} messages</Text> : null}</View>
      {!activeId ? <Text style={styles.copy}>Select a conversation to view messages.</Text> : messagesQuery.isLoading ? <LoadingCard label="Loading conversation…" /> : messagesQuery.isError ? <View style={styles.actionStack}><Text style={styles.error}>Messages could not load. Pull to refresh and try again.</Text><SecondaryButton label="Try again" onPress={() => { void messagesQuery.refetch(); }} /></View> : <View style={styles.chatMessageList}>{(messagesQuery.data?.data || []).map(message => { const own = message.sender_id === user?.id; return <View key={message.id} style={[styles.chatMessage, own && styles.chatMessageOwn]}><Text style={styles.chatMessageSender}>{own ? 'You' : message.sender?.full_name || message.sender_name || 'Team member'}</Text><Text style={styles.chatMessageText}>{message.message_text || (message.attachment_name ? `Attachment: ${message.attachment_name}` : 'Message')}</Text><Text style={styles.chatMessageTime}>{formatMessageTime(message.created_at)}</Text></View>; })}{!messagesQuery.data?.data?.length ? <Text style={styles.copy}>No messages yet. Start the conversation below.</Text> : null}</View>}
    </Card>

    {activeId ? <Card>{pendingAttachment ? <View style={styles.sectionHeader}><Text style={styles.copy} numberOfLines={1}>Attached: {pendingAttachment.name}</Text><SecondaryButton label="Remove" onPress={() => setPendingAttachment(null)} /></View> : null}<SecondaryButton label={attaching ? 'Reading file…' : 'Attach file'} onPress={() => { void chooseAttachment(); }} disabled={attaching || messagesQuery.isFetching} /><View style={styles.chatComposer}><TextInput value={composer} onChangeText={setComposer} placeholder="Write a message…" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.chatComposerInput]} /><Pressable accessibilityRole="button" disabled={(!composer.trim() && !pendingAttachment) || messagesQuery.isFetching} onPress={() => { void sendMessage(); }} style={[styles.chatSendButton, ((!composer.trim() && !pendingAttachment) || messagesQuery.isFetching) && styles.buttonDisabled]}><Text style={styles.chatSendText}>Send</Text></Pressable></View></Card> : null}
  </Screen>;
}
