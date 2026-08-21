-- Schedule the market tick.
--
-- No secret appears in this file. Migrations are committed, so the project URL
-- and the scheduler credential are read from Vault by name; both were created
-- out of band with `vault.create_secret`.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Re-running a migration must not fail on a job that already exists, and a
-- stale job pointing at a renamed function is worse than no job at all.
do $$
begin
  perform cron.unschedule('market-tick');
exception
  when others then null; -- no such job yet
end;
$$;

-- Every minute of UTC hours 03–10 inclusive, on weekdays — roughly 08:30–16:29
-- IST. Deliberately WIDER than the 09:15–15:30 session, for two reasons a cron
-- expression cannot fix: an hours field cannot express 09:15–15:30, and nothing
-- in cron syntax can encode NSE's ~15 annual trading holidays.
--
-- **This window is a cost bound, never the gate.** `isTradingSessionAt()` inside
-- the function is the business-time authority; trusting the schedule would have
-- the tick trading on Republic Day. Note `3-10` covers 03:00–10:59, not
-- 03:00–10:00 — the arithmetic is easy to get wrong by an hour.
select cron.schedule(
  'market-tick',
  '* 3-10 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/market-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Two layers, and both are load-bearing. The bearer credential satisfies
      -- the platform gateway, which rejects a caller with no Authorization
      -- header at all. But F16 measured what the gateway *accepts*, and it is
      -- any valid project key — including the publishable one that ships in the
      -- browser bundle. The scheduler secret below is what actually restricts
      -- this endpoint to the scheduler; the handler compares it before touching
      -- the database.
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      ),
      'x-scheduler-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_secret'
      )
    ),
    body := jsonb_build_object('trigger', 'cron', 'at', now()),
    -- Under the ten-second budget the function is held to, so a slow run is
    -- abandoned rather than overlapping the next minute's.
    timeout_milliseconds := 8000
  ) as request_id;
  $$
);

comment on extension pg_net is
  'Used by the market-tick cron job to POST to the Edge Function.';
