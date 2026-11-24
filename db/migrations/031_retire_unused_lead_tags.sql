-- Retire redundant status tags from new lead and follow-up forms.
-- Lifecycle statuses remain intact so existing records, reports, closure rules,
-- and audit history are preserved.
UPDATE crm.lead_tags
SET is_active = false
WHERE name IN ('Hot', 'Warm', 'Meeting Scheduled', 'Visit Completed', 'Booking', 'Closed Lost');
