export const USER_ROLE_RULES = { super_admin: { canManageRoles: ["sales_manager", "sales_agent"] }, sales_manager: { canManageRoles: ["sales_agent"] }, sales_agent: { canManageRoles: [] } } as const;
