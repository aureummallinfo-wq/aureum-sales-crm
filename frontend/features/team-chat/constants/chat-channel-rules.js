window.AureumChatChannelRules = Object.freeze({
  management: { visibility: 'management_only', allowedRoles: ['super_admin', 'sales_manager'] },
  standard: { visibility: 'all', allowedRoles: ['super_admin', 'sales_manager', 'sales_agent'] }
});
