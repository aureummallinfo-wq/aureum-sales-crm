import type { CustomerFilters as Filters } from '../types/customer.types';
export interface CustomerFiltersProps { value: Filters; onChange: (value: Filters) => void; }
