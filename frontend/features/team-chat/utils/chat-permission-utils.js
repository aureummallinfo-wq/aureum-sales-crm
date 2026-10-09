window.AureumChatPermissionUtils = Object.freeze({
  canViewChannel: (user, channel) => Boolean(user && channel && (channel.visibility !== 'management_only' || ['super_admin', 'sales_manager'].includes(user.role))),
  canViewGroupChat: (user, group) => Boolean(user && group && !group.isArchived && group.memberIds.includes(user.id)),
  canCreateGroupChat: user => Boolean(user && ['super_admin', 'sales_manager'].includes(user.role)),
  canManageGroupChat: (user, group) => Boolean(user && group && (user.role === 'super_admin' || (user.role === 'sales_manager' && group.createdBy === user.id))),
  canAddGroupMembers: (user, group) => Boolean(user && group && (user.role === 'super_admin' || (user.role === 'sales_manager' && group.createdBy === user.id))),
  canRemoveGroupMembers: (user, group) => Boolean(user && group && (user.role === 'super_admin' || (user.role === 'sales_manager' && group.createdBy === user.id))),
  canRenameGroupChat: (user, group) => Boolean(user && group && (user.role === 'super_admin' || (user.role === 'sales_manager' && group.createdBy === user.id))),
  canArchiveGroupChat: (user, group) => Boolean(user && group && (user.role === 'super_admin' || (user.role === 'sales_manager' && group.createdBy === user.id))),
  canSendChatMessage: (user, chat) => Boolean(user && chat && (chat.type !== 'group' || chat.memberIds?.includes(user.id)))
});
