// Supabase Edge Function: send-push
//
// Triggered by a Database Webhook on INSERT into public.notification_outbox.
// Reads the recipient's push subscriptions (service role) and delivers a Web
// Push to each device. Dead subscriptions (404/410) are pruned.
//
// Required secrets (Project Settings -> Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@rivo.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // Database Webhook payload: { type, table, record, ... }
  const record = (payload.record ?? payload) as {
    recipient_id?: string;
    title?: string;
    body?: string;
    url?: string;
  };

  if (!record?.recipient_id || !record.title) {
    return new Response("ignored", { status: 200 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", record.recipient_id);

  if (error) {
    console.error("query push_subscriptions failed:", error.message);
    return new Response(error.message, { status: 500 });
  }

  console.log(`recipient=${record.recipient_id} subscriptions=${subs?.length ?? 0}`);

  const message = JSON.stringify({
    title: record.title,
    body: record.body ?? "",
    url: record.url ?? "/",
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message
        );
        sent++;
      } catch (err) {
        failed++;
        const code = (err as { statusCode?: number }).statusCode;
        const detail = (err as { body?: string }).body ?? (err as Error).message;
        console.error(`send failed (status=${code}): ${detail}`);
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );

  const summary = { recipient: record.recipient_id, total: subs?.length ?? 0, sent, failed };
  console.log("send-push summary:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
