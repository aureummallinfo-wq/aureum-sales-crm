import type { CrmUser } from "./user.types";
export interface UserReportSummary { userId: string; userName: string; role: CrmUser["role"]; teamId?: string; status: CrmUser["status"]; assignedLeads: number; followUpsDue: number; closedDeals: number; }
