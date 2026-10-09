window.AureumTeamChatHooks = Object.freeze({
  useChatChannels: () => apiFetch('/api/chat/channels'),
  useGroupChats: () => apiFetch('/api/chat/groups'),
  useDirectMessages: () => apiFetch('/api/chat/direct'),
  useChatMessages: (chatId, chatType) => apiFetch(`/api/chat/${chatType === 'channel' ? 'channels' : chatType === 'group' ? 'groups' : 'direct'}/${chatId}/messages`),
  useSendMessage: (input, chatType) => apiFetch(`/api/chat/${chatType === 'channel' ? 'channels' : chatType === 'group' ? 'groups' : 'direct'}/${input.chatId}/messages`, { method: 'POST', body: JSON.stringify(input) }),
  useChatAttachments: chatId => apiFetch(`/api/chat/${chatId}/attachments`),
  useRightInfoPanel: () => ({ open: true, close: false }),
  useUnreadCounts: () => apiFetch('/api/chat/unread-counts'),
  useUserPresence: () => apiFetch('/api/chat/users'),
  useCreateGroupChat: input => apiFetch('/api/chat/groups', { method: 'POST', body: JSON.stringify(input) }),
  useUpdateGroupChat: (id, input) => apiFetch(`/api/chat/groups/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  useAddGroupMembers: (id, memberIds) => apiFetch(`/api/chat/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ memberIds }) }),
  useRemoveGroupMember: (id, userId) => apiFetch(`/api/chat/groups/${id}/members/${userId}`, { method: 'DELETE' }),
  useArchiveGroupChat: id => apiFetch(`/api/chat/groups/${id}/archive`, { method: 'PATCH' })
});
