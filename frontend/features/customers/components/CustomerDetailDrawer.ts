import type { CustomerDetailResponse } from '../types/customer.types';
export interface CustomerDetailDrawerProps { detail?: CustomerDetailResponse; open: boolean; activeTab: 'overview' | 'timeline' | 'notes' | 'follow-ups'; }
