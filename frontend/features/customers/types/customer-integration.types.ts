export type UserId = string; export type TeamId = string; export type LeadId = string; export type CustomerId = string; export type FollowUpId = string; export type ActivityId = string; export type AgentId = string;
export type IntegrationModule = 'dashboard' | 'leads' | 'customers' | 'follow-ups' | 'reports' | 'agents';
export type EntityType = 'lead' | 'customer' | 'follow_up' | 'user' | 'team' | 'note' | 'activity';
export type OwnershipScope = 'company' | 'team' | 'own';
export interface CustomerToLeadLink { customerId: CustomerId; leadId?: LeadId; customerName: string; phone: string; whatsappNumber?: string; email?: string; assignedAgentId?: AgentId; assignedTeamId?: TeamId; status: string; }
export interface CustomerToFollowUpDraft { customerId: CustomerId; leadId?: LeadId; assignedAgentId?: AgentId; assignedTeamId?: TeamId; customerName: string; phone: string; suggestedFollowUpType?: string; suggestedDueDate?: string; suggestedNote?: string; }
export interface CustomerToDashboardSummarySource { totalCustomers: number; activeCustomers: number; hotCustomers: number; bookingInterested: number; closedCustomers: number; recentCustomerIds: CustomerId[]; }
export interface CustomerToReportsMetricSource { customerId: CustomerId; leadId?: LeadId; assignedAgentId?: AgentId; assignedTeamId?: TeamId; status: string; source: string; interestedIn: string; budget?: number; createdAt: string; lastActivityAt?: string; nextFollowUpAt?: string; }
