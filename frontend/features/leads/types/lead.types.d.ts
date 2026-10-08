export type UserRole = 'SUPER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Hot' | 'Warm' | 'Cold' | 'No Response' | 'Follow-up' | 'Visit Scheduled' | 'Visit Completed' | 'Meeting Scheduled' | 'Negotiation' | 'Booking' | 'Closed Won' | 'Closed Lost' | 'Not Interested' | 'Invalid';
export type LeadSource = 'Website' | 'WhatsApp' | 'Facebook' | 'Instagram' | 'Sales Partner' | 'Referral' | 'Walk-in' | 'Manual Entry' | string;
export type LeadPriority = 'Low' | 'Medium' | 'High' | 'VIP';
export type PropertyInterest = 'Apartment' | 'Commercial Shop' | 'Office' | 'Hotel Room' | 'Food Court Space' | 'Plot' | 'Other' | string;

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  whatsapp_number?: string;
  email?: string;
  city?: string;
  area?: string;
  interested_in: string;
  property_type?: string;
  budget?: string;
  preferred_location?: string;
  purpose?: string;
  buying_timeline?: string;
  financing_required?: boolean;
  lead_source: LeadSource;
  status: LeadStatus;
  priority?: LeadPriority;
  tags: string[];
  assigned_agent_id?: string | null;
  assigned_agent?: string;
  assigned_team_id?: string | null;
  next_follow_up_at?: string;
  last_contacted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LeadNote { id: string; lead_id?: string; note: string; user_id?: string; created_at: string; }
export interface LeadActivity { id: string; lead_id?: string; activity_type: string; description: string; user_id?: string; created_at: string; metadata?: Record<string, unknown>; }
export interface LeadFilters { q?: string; status?: LeadStatus | ''; source?: LeadSource | ''; agentId?: string; propertyType?: string; priority?: LeadPriority | ''; }
export interface CreateLeadInput extends Partial<Lead> { full_name: string; phone: string; interested_in: string; }
export interface UpdateLeadInput extends Partial<CreateLeadInput> { id: string; }
export interface LeadsListResponse { scope: 'all' | 'my'; requestedBy: string; data: Lead[]; }
export interface LeadDetailResponse { data: Lead; activity: LeadActivity[]; }
