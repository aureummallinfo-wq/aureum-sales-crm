window.AureumCustomerConstants = {
  statuses: window.AureumCRMStatusTags?.values || ["New","Contacted","Qualified","Hot","Warm","Cold","Follow-up","Visit Scheduled","Visit Completed","Meeting Scheduled","Negotiation","Booking","Closed Won","Closed Lost","No Response","Not Interested","Invalid"],
  sources: ['Website', 'WhatsApp', 'Facebook', 'Sales Partner', 'Walk-in', 'Referral', 'Manual Entry'],
  interests: ['1 Bed Apartment', '2 Bed Apartment', 'Commercial Shop', 'Corporate Office', 'Food Court Space'],
  propertyTypes: ['1 Bed Apartment', '2 Bed Apartment', 'Commercial', 'Office', 'Food Court Space', 'Other'],
  tags: window.AureumCRMStatusTags?.values || ["New","Contacted","Qualified","Hot","Warm","Cold","Follow-up","Visit Scheduled","Visit Completed","Meeting Scheduled","Negotiation","Booking","Closed Won","Closed Lost","No Response","Not Interested","Invalid"],
  priorities: ['High', 'Medium', 'Low'],
  purposes: ['Investment', 'Personal Use', 'Business', 'Other'],
  timelines: ['Immediate', '1 Month', '3 Months', '6 Months', 'Not Sure'],
  contactMethods: ['Phone', 'WhatsApp', 'Email']
};
