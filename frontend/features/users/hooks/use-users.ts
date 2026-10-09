export function useUsers(filters?: Record<string, string>) { return { endpoint: "/api/users", filters: filters || {} }; }
export function useUserDetail(userId: string) { return { endpoint: `/api/users/${userId}` }; }
export const useCreateUser = () => ({ method: "POST" as const, endpoint: "/api/users" }); export const useUpdateUser = (id: string) => ({ method: "PATCH" as const, endpoint: `/api/users/${id}` });
export const useDeactivateUser = (id: string) => ({ method: "PATCH" as const, endpoint: `/api/users/${id}/status` }); export const useActivateUser = useDeactivateUser;
export const useSendAccessEmail = (id: string) => ({ method: "POST" as const, endpoint: `/api/users/${id}/send-access-email` }); export const useResendAccessEmail = (id: string) => ({ method: "POST" as const, endpoint: `/api/users/${id}/resend-access-email` }); export const useResetUserPassword = (id: string) => ({ method: "POST" as const, endpoint: `/api/users/${id}/reset-password` });
