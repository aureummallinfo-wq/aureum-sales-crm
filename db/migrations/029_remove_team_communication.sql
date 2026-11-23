-- Remove the retired Team Communication feature.
--
-- This migration intentionally does not use CASCADE and does not touch CRM
-- sales data. The deployment gate takes a VPS PostgreSQL backup before this
-- file is applied.

-- Remove feature-specific notifications and queued deliveries first.
DELETE FROM crm.notification_settings
 WHERE event_key = 'team_chat_message';

DELETE FROM crm.notifications
 WHERE event_key = 'team_chat_message'
    OR related_entity_type IN ('channel', 'group', 'direct_conversation', 'chat_message');

DELETE FROM crm.notification_definitions
 WHERE event_key = 'team_chat_message';

DELETE FROM crm.outbox_events
 WHERE event_type = 'chat_message_created'
    OR aggregate_type = 'chat_message';

-- Remove the retired permission and personal preference without touching the
-- shared permissions/preferences tables themselves.
DELETE FROM crm.role_permissions
 WHERE permission_id IN (SELECT id FROM crm.permissions WHERE key = 'team-chat');
DELETE FROM crm.permissions
 WHERE key = 'team-chat';
DELETE FROM crm.user_preferences
 WHERE preference_key = 'team_chat_message';

-- Remove only the chat keys from the legacy compatibility snapshot. The
-- shared snapshot table itself remains because other CRM data still uses it.
DO $$
BEGIN
  IF to_regclass('public.aureum_crm_state') IS NOT NULL THEN
    UPDATE public.aureum_crm_state
       SET state = state - ARRAY[
         'chatChannels', 'chatMessages', 'chatReadReceipts', 'groupChats',
         'groupMessages', 'directMessages', 'chatAttachments', 'chatLinks'
       ],
       updated_at = now()
     WHERE id = 'default';
  END IF;
END $$;

-- Current relational schema: children first, then their owning conversations.
DROP TABLE IF EXISTS crm.chat_message_reactions;
DROP TABLE IF EXISTS crm.chat_links;
DROP TABLE IF EXISTS crm.chat_attachments;
DROP TABLE IF EXISTS crm.chat_read_receipts;
DROP TABLE IF EXISTS crm.chat_messages;
DROP TABLE IF EXISTS crm.chat_group_members;
DROP TABLE IF EXISTS crm.chat_groups;
DROP TABLE IF EXISTS crm.chat_channel_members;
DROP TABLE IF EXISTS crm.chat_channels;
DROP TABLE IF EXISTS crm.direct_conversation_members;
DROP TABLE IF EXISTS crm.direct_conversations;

-- Legacy compatibility schema: explicit order is kept for installations that
-- still have these public tables. No shared CRM tables are dropped.
DROP TABLE IF EXISTS public.chat_attachments;
DROP TABLE IF EXISTS public.chat_links;
DROP TABLE IF EXISTS public.chat_read_receipts;
DROP TABLE IF EXISTS public.chat_messages;
DROP TABLE IF EXISTS public.chat_group_members;
DROP TABLE IF EXISTS public.chat_groups;
DROP TABLE IF EXISTS public.chat_channels;
DROP TABLE IF EXISTS public.direct_messages;
