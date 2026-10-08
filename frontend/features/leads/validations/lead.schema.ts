import type { CreateLeadInput } from '../types/lead.types';
export const leadSchema = { required: ['full_name', 'phone', 'interested_in'] as const };
export type LeadFormValues = CreateLeadInput;
