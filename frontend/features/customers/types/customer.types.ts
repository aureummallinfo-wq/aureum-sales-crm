export type UserRole = 'super_admin' | 'sales_manager' | 'sales_agent';
export type CustomerStatus = 'Active' | 'Hot' | 'Warm' | 'Cold' | 'Follow-up' | 'Booking Interested' | 'Closed Won' | 'Closed Lost' | 'Not Interested';
export type CustomerSource = 'Website' | 'WhatsApp' | 'Facebook' | 'Sales Partner' | 'Walk-in' | 'Referral' | 'Manual Entry';
export type CustomerPriority = 'High' | 'Medium' | 'Low';
export type PropertyInterest = '1 Bed Apartment' | '2 Bed Apartment' | 'Commercial Shop' | 'Corporate Office' | 'Food Court Space' | 'Hotel Room';
export type PreferredContactMethod = 'Phone' | 'WhatsApp' | 'Email';
export type CustomerPurpose = 'Investment' | 'Personal Use' | 'Business' | 'Other';
export type BuyingTimeline = 'Immediate' | '1 Month' | '3 Months' | '6 Months' | 'Not Sure';

export interface Customer {
  id: string; leadId?: string; fullName: string; phone: string; whatsappNumber?: string; email?: string; city?: string; area?: string; preferredContactMethod?: PreferredContactMethod;
  interestedIn: PropertyInterest; propertyType?: string; budget?: number; preferredLocation?: string; purpose?: CustomerPurpose; buyingTimeline?: BuyingTimeline; financingRequired?: boolean;
  customerStatus: CustomerStatus; source: CustomerSource; priority?: CustomerPriority; tags?: string[]; assignedAgentId?: string; assignedAgentName?: string; assignedTeamId?: string; createdBy: string;
  lastContactedAt?: string; nextFollowUpAt?: string; lastActivityAt?: string; createdAt: string; updatedAt: string;
}
export interface CustomerNote { id: string; customerId: string; userId: string; userName: string; note: string; createdAt: string; }
export interface CustomerActivity { id: string; customerId: string; leadId?: string; userId: string; userName: string; activityType: 'customer_created' | 'customer_updated' | 'lead_linked' | 'status_changed' | 'note_added' | 'follow_up_created' | 'follow_up_completed' | 'whatsapp_clicked' | 'call_clicked' | 'booking_discussed' | 'customer_closed_won' | 'customer_closed_lost'; description: string; metadata?: Record<string, unknown>; createdAt: string; }
export interface CustomerFollowUpPreview { id: string; customerId: string; followUpType: 'Call' | 'WhatsApp' | 'Email' | 'Payment Plan Follow-up' | 'Booking Follow-up' | 'Site Visit Reminder' | 'General Follow-up'; dueDate: string; dueTime?: string; status: 'Pending' | 'Completed' | 'Overdue' | 'Missed' | 'Rescheduled' | 'Cancelled'; assignedAgentId?: string; assignedAgentName?: string; notes?: string; }
export interface CustomerFilters { search?: string; status?: CustomerStatus | 'All'; source?: CustomerSource | 'All'; assignedAgentId?: string; city?: string; interestedIn?: PropertyInterest | 'All'; priority?: CustomerPriority | 'All'; budgetMin?: number; budgetMax?: number; nextFollowUpFrom?: string; nextFollowUpTo?: string; lastActivityFrom?: string; lastActivityTo?: string; tag?: string; }
export interface CustomersListResponse { data: Customer[]; meta: { total: number; page: number; pageSize: number; totalPages: number; }; }
export interface CustomerDetailResponse { customer: Customer; notes: CustomerNote[]; activity: CustomerActivity[]; followUps: CustomerFollowUpPreview[]; }
