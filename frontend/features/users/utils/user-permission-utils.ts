import type { CrmUser, UserRole } from "../types/user.types";
export function canAccessUsersModule(role: UserRole): boolean { return role === "super_admin" || role === "sales_manager"; }
export function canManageTarget(actor: CrmUser, target: CrmUser): boolean { return actor.role === "super_admin" || (actor.role === "sales_manager" && target.role === "sales_agent" && actor.teamId === target.teamId); }
export const canCreateUser = (role: UserRole) => role === "super_admin" || role === "sales_manager";
export const canEditUser = canManageTarget;
export const canDeactivateUser = canManageTarget;
export const canResetUserPassword = canManageTarget;
export const canSendAccessEmail = canManageTarget;
export const canViewUserDetail = canManageTarget;
export const canManageUserTeam = (role: UserRole) => role === "super_admin";
export const canAccessMyAccount = (_role: UserRole) => true;
export const canAccessChangePassword = (_role: UserRole) => true;
