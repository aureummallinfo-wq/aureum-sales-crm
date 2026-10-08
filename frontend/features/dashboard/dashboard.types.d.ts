export type UserRole = 'super_admin' | 'sales_manager' | 'sales_agent';
export type DashboardScope = 'company' | 'team' | 'own';
export type DashboardDateRange = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export interface DashboardQueryParams {
  role: UserRole;
  scope: DashboardScope;
  dateRange: DashboardDateRange;
  startDate?: string;
  endDate?: string;
  teamId?: string;
  userId?: string;
}

export interface DashboardKpi {
  id: string;
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: { value: number; direction: 'up' | 'down' | 'neutral'; label: string };
  icon?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'gold';
}

export interface DashboardSummary {
  totalLeads?: number;
  newLeads?: number;
  hotLeads?: number;
  followUpsDue?: number;
  overdueFollowUps?: number;
  activeCustomers?: number;
  closedDeals?: number;
  lostDeals?: number;
  conversionRate?: number;
  myLeads?: number;
  myHotLeads?: number;
  myFollowUpsToday?: number;
  myOverdueFollowUps?: number;
  myCustomers?: number;
  myClosedDeals?: number;
  bookingVolume?: string;
}

export interface LeadInflowPoint { label: string; leads: number; newLeads?: number; qualifiedLeads?: number; closedDeals?: number; }
export type LeadSource = 'Website' | 'WhatsApp' | 'Facebook' | 'Sales Partner' | 'Walk-in' | 'Referral' | 'Manual Entry';
export interface LeadSourceData { source: LeadSource; count: number; percentage: number; }
export type FollowUpStatus = 'Pending' | 'Completed' | 'Overdue' | 'Missed' | 'Rescheduled' | 'Cancelled';
export interface FollowUpPerformanceData { status: FollowUpStatus; count: number; percentage?: number; }
export interface AgentPerformanceData { agentId: string; agentName: string; teamName?: string; assignedLeads: number; contactedLeads: number; completedFollowUps: number; overdueFollowUps: number; closedDeals: number; conversionRate: number; }
export type ConversionStage = 'New' | 'Contacted' | 'Qualified' | 'Follow-up' | 'Negotiation' | 'Booking' | 'Closed Won';
export interface ConversionOverviewData { stage: ConversionStage; count: number; percentage?: number; }
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Hot' | 'Warm' | 'Cold' | 'Follow-up' | 'No Response' | 'Visit Scheduled' | 'Visit Completed' | 'Meeting Scheduled' | 'Negotiation' | 'Booking' | 'Closed Won' | 'Closed Lost' | 'Not Interested' | 'Invalid';
export interface RecentLead { id: string; leadName: string; phone?: string; source: LeadSource; interestedIn: string; assignedAgent?: string; status: LeadStatus; createdAt: string; }
export type FollowUpType = 'Call' | 'WhatsApp' | 'Email' | 'Payment Plan Follow-up' | 'Booking Follow-up' | 'Site Visit Reminder' | 'General Follow-up';
export interface TodayFollowUp { id: string; customerId: string; customerName: string; phone?: string; followUpType: FollowUpType; assignedAgent?: string; dueTime: string; status: FollowUpStatus; priority: 'High' | 'Medium' | 'Low'; }

export interface DashboardResponse {
  role: UserRole;
  scope: DashboardScope;
  dateRange: DashboardDateRange;
  summary: DashboardSummary;
  kpis: DashboardKpi[];
  charts: { leadInflow: LeadInflowPoint[]; leadSources: LeadSourceData[]; followUpPerformance: FollowUpPerformanceData[]; agentPerformance?: AgentPerformanceData[]; conversionOverview: ConversionOverviewData[]; };
  recentLeads: RecentLead[];
  todayFollowUps: TodayFollowUp[];
  meta: { generatedAt: string; timezone: string; currency: string; };
}

export interface UseDashboardDataResult { data?: DashboardResponse; isLoading: boolean; isError: boolean; error?: Error; refetch: () => void; }
