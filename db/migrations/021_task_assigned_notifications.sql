INSERT INTO crm.notification_definitions (event_key, event_name, is_active)
VALUES ('task_assigned', 'Task assigned', true)
ON CONFLICT (event_key) DO UPDATE
SET event_name = EXCLUDED.event_name,
    is_active = true;
