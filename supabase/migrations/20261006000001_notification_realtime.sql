-- Keep the website and app notification feeds in sync in the testing schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'hostiggo_testing_schema'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hostiggo_testing_schema.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'hostiggo_testing_schema'
      AND tablename = 'notification_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hostiggo_testing_schema.notification_preferences;
  END IF;
END
$$;

ALTER TABLE hostiggo_testing_schema.notifications REPLICA IDENTITY FULL;
ALTER TABLE hostiggo_testing_schema.notification_preferences REPLICA IDENTITY FULL;
