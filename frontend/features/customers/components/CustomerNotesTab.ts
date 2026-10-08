import type { CustomerNote } from '../types/customer.types';
export type CustomerNotesTabProps = { notes: CustomerNote[]; loading: boolean; onAdd: (note: string) => void };
