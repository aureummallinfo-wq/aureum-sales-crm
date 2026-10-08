import type { Customer, UserRole } from '../types/customer.types';
export interface CustomerActionMenuProps { customer: Customer; role: UserRole; onOpen: (id: string) => void; }
