export type UserId = string; export type TeamId = string; export type AgentId = string; export type LeadId = string; export type CustomerId = string; export type FollowUpId = string; export type ReportId = string;
export type ReportSourceModule = "leads" | "customers" | "follow-ups" | "agents" | "dashboard";
export interface ReportScopeContext { role: "super_admin" | "sales_manager"; scope: "company" | "team"; userId: UserId; teamId?: TeamId; }
export interface ReportExportRequest { reportType: "agent_report" | "lead_report" | "customer_report" | "followup_report" | "conversion_report"; format: "csv" | "pdf_placeholder"; dateRange: string; teamId?: TeamId; agentId?: AgentId; }
