-- The "Former member" placeholder (20261031040700) wasn't readable by Supabase Auth: listing users (Admin API,
-- Studio) failed with "Database error finding users" on any page that held it. Two causes:
--   * banned_until = 'infinity', which Auth can't scan: a far-future date keeps it unable to sign in;
--   * NULL token columns, which Auth expects as empty strings (as every user it creates has).
update auth.users
   set banned_until = case when banned_until = 'infinity' then timestamptz '9999-12-31 00:00:00+00' else banned_until end,
       confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change = coalesce(email_change, ''),
       phone_change = coalesce(phone_change, ''),
       phone_change_token = coalesce(phone_change_token, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       reauthentication_token = coalesce(reauthentication_token, '')
 where id = 'f0000000-0000-4000-8000-000000000000';
