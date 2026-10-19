export type FollowUpStatus = 'Pending' | 'Contacted' | 'Completed' | 'Overdue' | 'Missed' | 'Rescheduled' | 'Cancelled';
export type FollowUpPriority = 'High' | 'Medium' | 'Low';
export type FollowUpType = 'Call' | 'WhatsApp' | 'Email' | 'Payment Plan Follow-up' | 'Booking Follow-up' | 'Site Visit Reminder' | 'General Follow-up';
export interface FollowUp { id: string; customer_id: string; lead_id?: string | null; assigned_agent_id: string; follow_up_type: FollowUpType; due_date: string; due_time: string; priority: FollowUpPriority; status: FollowUpStatus; notes?: string; followup_tag?: string; lifecycle_status?: Exclude<FollowUpStatus, 'Contacted'>; outcome?: 'Contacted'; last_activity_at?: string; last_activity_description?: string; last_activity_by?: string; created_at?: string; completed_at?: string; reschedule_history?: Array<{ fromDate: string; fromTime: string; toDate: string; toTime: string; reason?: string }>; }

export interface FollowUpNoteInput { note: string; customer_contacted?: boolean; next_followup_days?: 1 | 2 | 3 | 5 | 7 | 10 | "custom" | "none"; next_due_date?: string; next_due_time?: string; followup_tag?: string; }
