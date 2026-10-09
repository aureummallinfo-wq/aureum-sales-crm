window.AureumChatRoleRules = Object.freeze({
  canCreateGroup: role => ['SUPER_ADMIN', 'SALES_MANAGER'].includes(String(role || '').toUpperCase()),
  canManageAnyGroup: role => String(role || '').toLowerCase() === 'super_admin',
  canManageOwnedGroup: (role, ownerId, userId) => String(role || '').toLowerCase() === 'super_admin' || (String(role || '').toLowerCase() === 'sales_manager' && ownerId === userId)
});
