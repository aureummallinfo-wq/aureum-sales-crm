import type { Customer } from '../types/customer.types';
export interface CustomerTableProps { data: Customer[]; loading: boolean; emptyMessage?: string; }
export type CustomerTableRenderer = (props: CustomerTableProps) => string;
