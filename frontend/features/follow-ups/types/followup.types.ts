export type FollowUpStatus = 'Pending' | 'Completed' | 'Overdue' | 'Missed' | 'Rescheduled' | 'Cancelled';
export type FollowUpPriority = 'High' | 'Medium' | 'Low';
export type FollowUpType = 'Call' | 'WhatsApp' | 'Email' | 'Payment Plan Follow-up' | 'Booking Follow-up' | 'Site Visit Reminder' | 'General Follow-up';
export interface FollowUp { id: string; customer_id: string; lead_id?: string | null; assigned_agent_id: string; follow_up_type: FollowUpType; due_date: string; due_time: string; priority: FollowUpPriority; status: FollowUpStatus; notes?: string; created_at?: string; completed_at?: string; reschedule_history?: Array<{ fromDate: string; fromTime: string; toDate: string; toTime: string; reason?: string }>; }
