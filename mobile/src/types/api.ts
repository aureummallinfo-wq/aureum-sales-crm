export type Role = 'super_admin' | 'sales_manager' | 'sales_agent' | 'hr' | 'project_manager';

export type User = {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  role: Role | string;
  team_id?: string | null;
};

export type Lead = {
  id: string;
  full_name: string;
  customer_id?: string | null;
  phone?: string;
  email?: string;
  status?: string;
  lead_source?: string;
  assigned_agent?: string;
  interested_in?: string;
  next_follow_up_at?: string | null;
};

export type Customer = {
  id: string;
  lead_id?: string | null;
  full_name: string;
  phone?: string;
  email?: string;
  customer_status?: string;
  status?: string;
  interested_in?: string;
  assigned_agent?: string;
  next_follow_up_at?: string | null;
};

export type Note = {
  id: string;
  note?: string;
  description?: string;
  user_name?: string;
  created_at?: string;
};

export type FollowUp = {
  id: string;
  customer_name?: string;
  follow_up_type?: string;
  due_date?: string;
  due_time?: string;
  status?: string;
  assigned_agent?: string;
  notes?: string;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  due_at?: string;
  assignedAgent?: string;
  assignedAgentEmail?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  followUpId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type NotificationItem = {
  id: string;
  event_type?: string;
  title: string;
  message?: string;
  related_entity_type?: string;
  related_entity_id?: string | null;
  is_read?: boolean;
  created_at?: string;
  actor?: string;
};

export type ApiList<T> = { data: T[]; meta?: { total?: number; nextCursor?: string | null; hasMore?: boolean } };

export type DashboardSummary = {
  totalLeads?: number;
  newLeads?: number;
  hotLeads?: number;
  followUpsDue?: number;
  overdueFollowUps?: number;
  activeCustomers?: number;
  closedDeals?: number;
  conversionRate?: number;
};

export type DashboardInitial = {
  summary: DashboardSummary;
  leadInflow?: Array<Record<string, unknown>>;
  leadSources?: Array<Record<string, unknown>>;
  followUpPerformance?: Array<Record<string, unknown>>;
  conversionOverview?: Array<Record<string, unknown>>;
  recentLeads?: Lead[];
  todayFollowUps?: FollowUp[];
  agentPerformance?: Array<Record<string, unknown>> | null;
  meta?: { generatedAt?: string; timezone?: string };
};
