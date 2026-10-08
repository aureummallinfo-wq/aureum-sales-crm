import type { CustomerFilters, Customer, CustomerDetailResponse } from '../types/customer.types';
export interface CustomersHookResult { data: Customer[]; loading: boolean; error?: string; }
export function useCustomers(filters?: CustomerFilters): CustomersHookResult { void filters; return { data: [], loading: false }; }
export function useMyCustomers(filters?: CustomerFilters): CustomersHookResult { void filters; return { data: [], loading: false }; }
export function useCustomerDetail(customerId: string): { data?: CustomerDetailResponse; loading: boolean; error?: string } { void customerId; return { loading: false }; }
export function useUpdateCustomer(): { mutate: (customerId: string, input: Partial<Customer>) => Promise<void> } { return { mutate: async () => undefined }; }
export function useChangeCustomerStatus(): { mutate: (customerId: string, status: string) => Promise<void> } { return { mutate: async () => undefined }; }
export function useAddCustomerNote(): { mutate: (customerId: string, note: string) => Promise<void> } { return { mutate: async () => undefined }; }
