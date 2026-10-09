export type UserId = string;
export type TeamId = string;
export type LeadId = string;
export type CustomerId = string;
export type FollowUpId = string;
export type ChatId = string;
export type MessageId = string;
export type AttachmentId = string;
export type IntegrationModule = "dashboard" | "leads" | "customers" | "follow-ups" | "team-chat" | "reports" | "agents";
export type ChatCrmReferenceType = "lead" | "customer" | "follow_up" | "booking" | "report_placeholder";
export interface ChatCrmReference { referenceType: ChatCrmReferenceType; referenceId: string; label: string; sharedBy: UserId; sharedAt: string; }
export interface ChatToLeadReference { chatId: ChatId; messageId: MessageId; leadId: LeadId; sharedBy: UserId; }
export interface ChatToCustomerReference { chatId: ChatId; messageId: MessageId; customerId: CustomerId; sharedBy: UserId; }
export interface ChatToFollowUpReference { chatId: ChatId; messageId: MessageId; followUpId: FollowUpId; sharedBy: UserId; }
