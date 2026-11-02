const leadConstants = window.AureumLeadConstants || {};
const canonicalPropertyTypes = leadConstants.propertyTypes || ['1 Bed Apartment', '2 Bed Apartment', 'Commercial', 'Office', 'Food Court Space', 'Other'];
const canonicalLeadSources = leadConstants.sources || ['Website', 'WhatsApp', 'Facebook', 'Instagram', 'Sales Partner', 'Referral', 'Walk-in', 'Manual Entry'];
const canonicalPriorities = leadConstants.priorities || ['Low', 'Medium', 'High', 'VIP'];

window.AureumCustomerConstants = {
  statuses: window.AureumCRMStatusTags?.values || ["New","Contacted","Qualified","Hot","Warm","Cold","Follow-up","Visit Scheduled","Visit Completed","Meeting Scheduled","Negotiation","Booking","Closed Won","Closed Lost","No Response","Not Interested","Invalid"],
  // Customers and Leads must expose the same vocabulary. These values are
  // read from the lead constants when available because both screens filter
  // the same underlying CRM fields.
  sources: canonicalLeadSources,
  interests: canonicalPropertyTypes,
  propertyTypes: canonicalPropertyTypes,
  tags: window.AureumCRMStatusTags?.values || ["New","Contacted","Qualified","Hot","Warm","Cold","Follow-up","Visit Scheduled","Visit Completed","Meeting Scheduled","Negotiation","Booking","Closed Won","Closed Lost","No Response","Not Interested","Invalid"],
  priorities: canonicalPriorities,
  purposes: ['Investment', 'Personal Use', 'Business', 'Other'],
  timelines: ['Immediate', '1 Month', '3 Months', '6 Months', 'Not Sure'],
  contactMethods: ['Phone', 'WhatsApp', 'Email']
};
