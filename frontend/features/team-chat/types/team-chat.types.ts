export type UserRole = "super_admin" | "sales_manager" | "sales_agent";
export type ChatType = "channel" | "group" | "direct";
export type ChatMessageType = "text" | "attachment" | "system" | "crm_reference_placeholder";
export type UserPresenceStatus = "online" | "offline" | "away";
export type AttachmentType = "image" | "pdf" | "document" | "spreadsheet" | "other";
export type ChannelVisibility = "all" | "management_only" | "team_only";

export interface ChatUser { id: string; fullName: string; role: UserRole; teamId?: string; teamName?: string; avatarUrl?: string; presenceStatus: UserPresenceStatus; lastSeenAt?: string; }
export interface ChatMessagePreview { messageId: string; senderId: string; senderName: string; body?: string; messageType: ChatMessageType; createdAt: string; }
export interface ChatChannel { id: string; name: string; description?: string; channelType: "default"; visibility: ChannelVisibility; allowedRoles: UserRole[]; memberIds: string[]; createdBy: string; createdAt: string; updatedAt: string; lastMessage?: ChatMessagePreview; unreadCount?: number; }
export interface GroupChatMember { userId: string; userName: string; role: UserRole; teamId?: string; teamName?: string; avatarUrl?: string; presenceStatus: UserPresenceStatus; joinedAt: string; }
export interface GroupChat { id: string; groupName: string; description?: string; groupAvatarUrl?: string; createdBy: string; createdByName: string; ownerRole: UserRole; memberIds: string[]; members: GroupChatMember[]; isArchived: boolean; createdAt: string; updatedAt: string; lastMessage?: ChatMessagePreview; unreadCount?: number; }
export interface DirectMessageConversation { id: string; participantIds: string[]; participants: ChatUser[]; createdAt: string; updatedAt: string; lastMessage?: ChatMessagePreview; unreadCount?: number; }
export interface ChatAttachment { id: string; chatId: string; messageId: string; fileName: string; fileType: AttachmentType; fileSize: string; fileUrl?: string; uploadedBy: string; uploadedByName: string; uploadedAt: string; }
export interface ChatMessage { id: string; chatId: string; chatType: ChatType; senderId: string; senderName: string; senderRole: UserRole; senderAvatarUrl?: string; messageType: ChatMessageType; body?: string; attachments?: ChatAttachment[]; readByUserIds?: string[]; createdAt: string; updatedAt?: string; }
export interface SharedLink { id: string; chatId: string; title: string; url: string; sharedBy: string; sharedByName: string; sharedAt: string; }
export interface CreateGroupChatInput { groupName: string; description?: string; memberIds: string[]; }
export interface SendMessageInput { chatId: string; chatType: ChatType; body?: string; attachments?: ChatAttachment[]; }
export interface TeamChatState { selectedChatId?: string; selectedChatType?: ChatType; isRightInfoPanelOpen: boolean; }
export interface ChatAccessResult { canView: boolean; canSendMessage: boolean; canManageMembers: boolean; canRenameGroup: boolean; canArchiveGroup: boolean; reason?: string; }
