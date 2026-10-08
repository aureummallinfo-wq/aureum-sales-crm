export type UserId = string;
export type TeamId = string;
export type LeadId = string;
export type CustomerId = string;
export type FollowUpId = string;
export type ActivityId = string;
export type AgentId = UserId;
export type IntegrationModule = 'dashboard' | 'customers' | 'follow-ups' | 'reports';
export type EntityType = 'lead' | 'customer' | 'follow-up' | 'user';
export type OwnershipScope = 'company' | 'team' | 'assigned';

export interface RelatedEntityRef { id: string; type: EntityType; label?: string; }
export interface IntegrationContext { actorId: UserId; actorRole: string; source: 'lead'; sourceId: LeadId; targetModule: IntegrationModule; }
export interface IntegrationResult<T> { ok: boolean; data?: T; message?: string; }
export interface LeadToDashboardSummarySource { total: number; byStatus: Record<string, number>; bySource: Record<string, number>; updatedAt: string; }
export interface LeadToCustomerLink { leadId: LeadId; customerId?: CustomerId; available: boolean; }
export interface LeadToFollowUpDraft { leadId: LeadId; customerId?: CustomerId; title: string; dueAt?: string; assignedAgentId?: AgentId; }
export interface LeadToReportsMetricSource { leadId: LeadId; status: string; source: string; assignedAgentId?: AgentId; createdAt: string; }
