-- Older mobile builds send profile onboarding saves as an upsert. PostgREST's
-- conflict update includes user_id from that payload, so it also needs column
-- update permission. Existing RLS restricts both the old and new user_id to the
-- authenticated caller, and the active-user policy rejects deleted accounts.
grant update (user_id) on table public.profiles to authenticated;
