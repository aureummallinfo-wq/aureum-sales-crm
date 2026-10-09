import type { UserRole } from "./user.types";
export type AccessEmailStatus = "draft" | "queued" | "sent" | "failed";
export interface AccessEmailPayload { userId: string; fullName: string; email: string; role: UserRole; loginUrl: string; temporaryPassword: string; expiresAt?: string; }
export interface AccessEmailResult { success: boolean; status: AccessEmailStatus; message: string; sentAt?: string; }
export interface SendAccessEmailInput { userId: string; includeTemporaryPassword: boolean; }
export interface ResetPasswordInput { userId: string; sendAccessEmail: boolean; requirePasswordChangeOnFirstLogin: boolean; }
export interface ChangePasswordInput { currentPassword: string; newPassword: string; confirmPassword: string; }
export interface ChangePasswordResult { success: boolean; message: string; mustChangePassword: boolean; }
export interface PasswordPolicy { minLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumber: boolean; requireSpecialCharacter: boolean; }
