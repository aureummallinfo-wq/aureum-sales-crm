export interface CustomersScreenProps { role: 'SUPER_ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT'; customerCount: number; }
export type CustomersScreenRenderer = (props: CustomersScreenProps) => string;
