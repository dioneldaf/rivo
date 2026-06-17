-- 0008_push_webhook.sql
--
-- The dashboard Database Webhook on notification_outbox never got created, so
-- the send-push Edge Function was never called. Instead of relying on the UI,
-- we attach the webhook explicitly as a SQL trigger that calls the function via
-- pg_net. Version-controlled, reproducible, and consistent with the rest of the
-- app's "logic lives in migrations" approach.
--
-- Auth: we pass the project's ANON key as the Bearer token. The anon key is
-- public (it already ships in the frontend bundle), so it's safe to store here,
-- and it satisfies the Edge Function's verify_jwt gate. The function itself uses
-- its own injected SERVICE_ROLE key to read push_subscriptions.

create extension if not exists pg_net;

create or replace function public.notify_outbox_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://mtoopduydfsnbmtxckwr.supabase.co/functions/v1/send-push',
    body := jsonb_build_object(
      'recipient_id', new.recipient_id,
      'title', new.title,
      'body', new.body,
      'url', new.url
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10b29wZHV5ZGZzbmJtdHhja3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzAyMzYsImV4cCI6MjA5NjAwNjIzNn0.RwZdC4CND0BACg6CycJcCOl6dUnjQZ-Kl2RvAJzviqI'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_outbox_send_push on public.notification_outbox;
create trigger on_outbox_send_push
  after insert on public.notification_outbox
  for each row execute procedure public.notify_outbox_webhook();
