-- Migration: Enforce atomic users - one user per email/phone
-- Preference: Google auth > email auth > phone auth
-- When duplicates exist, merge data into preferred account and delete others
-- Also handles auth.users (Supabase Auth) merging

-- Step 1: Identify and merge duplicate accounts based on email
-- Keep Google auth accounts, merge others into them
DO $$
DECLARE
  email_rec RECORD;
  keeper_id uuid;
  duplicate_id uuid;
  keeper_auth_exists boolean;
  dup_phone text;
BEGIN
  -- For each email that has multiple user_id entries
  FOR email_rec IN 
    SELECT u.email, array_agg(u.user_id ORDER BY 
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM auth.users au 
          WHERE au.id = u.user_id 
          AND au.app_metadata->>'provider' = 'google'
        ) THEN 1
        WHEN u.email IS NOT NULL AND u.email != '' THEN 2
        ELSE 3
      END
    ) as user_ids
    FROM hostiggo_testing_schema.users u
    WHERE u.email IS NOT NULL AND u.email != ''
    GROUP BY u.email
    HAVING count(*) > 1
  LOOP
    -- First user_id in ordered array is the keeper (Google auth preferred)
    keeper_id := email_rec.user_ids[1];
    
    -- Check if keeper has auth.users record
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = keeper_id) INTO keeper_auth_exists;
    
    -- Merge data from duplicates into keeper
    FOR duplicate_id IN 
      SELECT unnest(email_rec.user_ids[2:array_length(email_rec.user_ids, 1)])
    LOOP
      -- Get phone from duplicate if exists
      SELECT phone INTO dup_phone FROM hostiggo_testing_schema.users WHERE user_id = duplicate_id;
      
      -- Update phone in keeper's auth.users if it doesn't have one
      IF keeper_auth_exists AND dup_phone IS NOT NULL THEN
        UPDATE auth.users
        SET phone = COALESCE(phone, dup_phone),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
              jsonb_build_object('phone', dup_phone),
            updated_at = now()
        WHERE id = keeper_id AND phone IS NULL;
      END IF;
      
      -- Update phone if keeper doesn't have one but duplicate does
      UPDATE hostiggo_testing_schema.users keeper
      SET phone = COALESCE(keeper.phone, dup.phone),
          emergency_contact = COALESCE(keeper.emergency_contact, dup.emergency_contact),
          profile_pic_url = COALESCE(keeper.profile_pic_url, dup.profile_pic_url),
          age = COALESCE(keeper.age, dup.age)
      FROM hostiggo_testing_schema.users dup
      WHERE keeper.user_id = keeper_id AND dup.user_id = duplicate_id;
      
      -- Migrate bookings to keeper
      UPDATE hostiggo_testing_schema.bookings
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate wishlists to keeper (avoid duplicates)
      INSERT INTO hostiggo_testing_schema.wishlists (user_id, listing_id, category_id, created_at)
      SELECT keeper_id, listing_id, category_id, created_at
      FROM hostiggo_testing_schema.wishlists
      WHERE user_id = duplicate_id
      ON CONFLICT (user_id, listing_id, category_id) DO NOTHING;
      
      DELETE FROM hostiggo_testing_schema.wishlists WHERE user_id = duplicate_id;
      
      -- Migrate reviews to keeper
      UPDATE hostiggo_testing_schema.review
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate chat messages to keeper
      UPDATE hostiggo_testing_schema.chat_messages
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate host records to keeper
      UPDATE hostiggo_testing_schema.host
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate feedback to keeper
      UPDATE hostiggo_testing_schema.feedback
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate categories to keeper
      UPDATE hostiggo_testing_schema.categories
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate login events to keeper
      UPDATE hostiggo_testing_schema.login_events
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate notifications to keeper
      UPDATE hostiggo_testing_schema.notifications
      SET user_id = keeper_id
      WHERE user_id = duplicate_id;
      
      -- Migrate notification preferences to keeper (if keeper doesn't have)
      INSERT INTO hostiggo_testing_schema.notification_preferences (user_id, channels, categories, updated_at)
      SELECT keeper_id, channels, categories, updated_at
      FROM hostiggo_testing_schema.notification_preferences
      WHERE user_id = duplicate_id
      ON CONFLICT (user_id) DO NOTHING;
      
      DELETE FROM hostiggo_testing_schema.notification_preferences WHERE user_id = duplicate_id;
      
      -- Delete auth.users record for duplicate (soft delete by marking as deleted)
      -- Supabase Auth doesn't allow direct deletes, so we ban the user
      UPDATE auth.users 
      SET banned_until = 'infinity'::timestamptz,
          updated_at = now()
      WHERE id = duplicate_id;
      
      -- Delete the duplicate user record
      DELETE FROM hostiggo_testing_schema.users WHERE user_id = duplicate_id;
      
      RAISE NOTICE 'Merged user % into % (email: %)', duplicate_id, keeper_id, email_rec.email;
    END LOOP;
  END LOOP;
END $$;

-- Step 2: Identify and merge duplicate accounts based on phone
-- Keep accounts with email, merge phone-only into them
DO $$
DECLARE
  phone_rec RECORD;
  keeper_id uuid;
  duplicate_id uuid;
  keeper_auth_exists boolean;
  dup_email text;
BEGIN
  FOR phone_rec IN 
    SELECT u.phone, array_agg(u.user_id ORDER BY 
      CASE 
        WHEN u.email IS NOT NULL AND u.email != '' THEN 1
        ELSE 2
      END
    ) as user_ids
    FROM hostiggo_testing_schema.users u
    WHERE u.phone IS NOT NULL AND u.phone != ''
    GROUP BY u.phone
    HAVING count(*) > 1
  LOOP
    keeper_id := phone_rec.user_ids[1];
    
    -- Check if keeper has auth.users record
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = keeper_id) INTO keeper_auth_exists;
    
    FOR duplicate_id IN 
      SELECT unnest(phone_rec.user_ids[2:array_length(phone_rec.user_ids, 1)])
    LOOP
      -- Get email from duplicate if exists
      SELECT email INTO dup_email FROM hostiggo_testing_schema.users WHERE user_id = duplicate_id;
      
      -- Update email in keeper's auth.users if it doesn't have one
      IF keeper_auth_exists AND dup_email IS NOT NULL AND dup_email != '' THEN
        UPDATE auth.users
        SET email = COALESCE(NULLIF(email, ''), dup_email),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
              jsonb_build_object('email', dup_email),
            updated_at = now()
        WHERE id = keeper_id AND (email IS NULL OR email = '');
      END IF;
      
      -- Update email if keeper doesn't have one but duplicate does
      UPDATE hostiggo_testing_schema.users keeper
      SET email = COALESCE(NULLIF(keeper.email, ''), dup.email),
          emergency_contact = COALESCE(keeper.emergency_contact, dup.emergency_contact),
          profile_pic_url = COALESCE(keeper.profile_pic_url, dup.profile_pic_url),
          age = COALESCE(keeper.age, dup.age)
      FROM hostiggo_testing_schema.users dup
      WHERE keeper.user_id = keeper_id AND dup.user_id = duplicate_id;
      
      -- Migrate all related records (same as email merge above)
      UPDATE hostiggo_testing_schema.bookings SET user_id = keeper_id WHERE user_id = duplicate_id;
      
      INSERT INTO hostiggo_testing_schema.wishlists (user_id, listing_id, category_id, created_at)
      SELECT keeper_id, listing_id, category_id, created_at
      FROM hostiggo_testing_schema.wishlists WHERE user_id = duplicate_id
      ON CONFLICT (user_id, listing_id, category_id) DO NOTHING;
      DELETE FROM hostiggo_testing_schema.wishlists WHERE user_id = duplicate_id;
      
      UPDATE hostiggo_testing_schema.review SET user_id = keeper_id WHERE user_id = duplicate_id;
      UPDATE hostiggo_testing_schema.chat_messages SET user_id = keeper_id WHERE user_id = duplicate_id;
      UPDATE hostiggo_testing_schema.host SET user_id = keeper_id WHERE user_id = duplicate_id;
      UPDATE hostiggo_testing_schema.feedback SET user_id = keeper_id WHERE user_id = duplicate_id;
      UPDATE hostiggo_testing_schema.categories SET user_id = keeper_id WHERE user_id = duplicate_id;
      UPDATE hostiggo_testing_schema.login_events SET user_id = keeper_id WHERE user_id = duplicate_id;
      UPDATE hostiggo_testing_schema.notifications SET user_id = keeper_id WHERE user_id = duplicate_id;
      
      INSERT INTO hostiggo_testing_schema.notification_preferences (user_id, channels, categories, updated_at)
      SELECT keeper_id, channels, categories, updated_at
      FROM hostiggo_testing_schema.notification_preferences WHERE user_id = duplicate_id
      ON CONFLICT (user_id) DO NOTHING;
      DELETE FROM hostiggo_testing_schema.notification_preferences WHERE user_id = duplicate_id;
      
      -- Ban duplicate auth.users record
      UPDATE auth.users 
      SET banned_until = 'infinity'::timestamptz,
          updated_at = now()
      WHERE id = duplicate_id;
      
      DELETE FROM hostiggo_testing_schema.users WHERE user_id = duplicate_id;
      
      RAISE NOTICE 'Merged user % into % (phone: %)', duplicate_id, keeper_id, phone_rec.phone;
    END LOOP;
  END LOOP;
END $$;

-- Step 3: Add unique constraints to prevent future duplicates
-- Email constraint (allow multiple NULL/empty, but unique non-empty values)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx 
ON hostiggo_testing_schema.users (lower(email)) 
WHERE email IS NOT NULL AND email != '';

-- Phone constraint (allow multiple NULL, but unique non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx 
ON hostiggo_testing_schema.users (phone) 
WHERE phone IS NOT NULL;

-- Step 4: Add check constraint to ensure at least email or phone exists
ALTER TABLE hostiggo_testing_schema.users 
ADD CONSTRAINT users_email_or_phone_required 
CHECK (
  (email IS NOT NULL AND email != '') 
  OR 
  phone IS NOT NULL
);
