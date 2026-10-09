export const createUserSchema = { required: ["fullName", "email", "role", "status"] as const, manageableRoles: ["sales_manager", "sales_agent"] as const };
export const updateUserSchema = { editable: ["fullName", "phone", "role", "teamId", "status"] as const };
