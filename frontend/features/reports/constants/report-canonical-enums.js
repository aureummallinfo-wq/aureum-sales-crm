window.AureumReportEnums = Object.freeze({
  leadStatuses: window.AureumCRMStatusTags?.values || ["New","Contacted","Qualified","Hot","Warm","Cold","Follow-up","Visit Scheduled","Visit Completed","Meeting Scheduled","Negotiation","Booking","Closed Won","Closed Lost","No Response","Not Interested","Invalid"],
  customerStatuses: window.AureumCRMStatusTags?.values || ["New","Contacted","Qualified","Hot","Warm","Cold","Follow-up","Visit Scheduled","Visit Completed","Meeting Scheduled","Negotiation","Booking","Closed Won","Closed Lost","No Response","Not Interested","Invalid"],
  followUpStatuses: ['Pending', 'Contacted', 'Completed', 'Overdue', 'Missed', 'Rescheduled', 'Cancelled'],
  conversionStages: ["New","Contacted","Follow-up","Visit Scheduled","Visit Completed","Negotiation","Closed Won"],
  leadSources: ['Website', 'WhatsApp', 'Facebook', 'Sales Partner', 'Walk-in', 'Referral', 'Manual Entry'],
  contactedLeadStatuses: ["Contacted","Hot","Cold","Follow-up","Visit Scheduled","Visit Completed","Negotiation","Closed Won","Not Interested"],
  activeCustomerStatuses: ["New","Contacted","Hot","Cold","Follow-up","Visit Scheduled","Visit Completed","Negotiation","No Response"]
});
