/**
 * trending-alert — Supabase Edge Function (Deno)
 *
 * Detects memes that gained ≥ SPIKE_THRESHOLD likes in the last hour
 * and sends an FCM push notification to the /topics/all topic.
 *
 * Deploy:
 *   supabase functions deploy trending-alert
 *   supabase secrets set FCM_SERVER_KEY=<your_key>
 *
 * Schedule (run in Supabase SQL Editor after enabling pg_cron + pg_net):
 *   select cron.schedule(
 *     'trending-check', '0 * * * *',
 *     $$select net.http_post(
 *       url     := 'https://YOUR_REF.supabase.co/functions/v1/trending-alert',
 *       headers := '{"Authorization":"Bearer YOUR_ANON_KEY","Content-Type":"application/json"}'::jsonb,
 *       body    := '{}'::jsonb
 *     )$$
 *   );
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVER_KEY  = Deno.env.get("FCM_SERVER_KEY")!;
const SPIKE_THRESHOLD = 100;   // likes gained in 1 hour
const BATCH_SIZE      = 50;    // max memes to check per invocation

interface Meme {
  id: string;
  title: string | null;
  cached_url: string | null;
  like_count: number;
}

interface StatsRecord {
  like_count: number;
  recorded_at: string;
}

serve(async (req: Request): Promise<Response> => {
  // Only POST allowed (called by pg_cron via pg_net)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Fetch unnotified memes (most liked first for priority)
  const { data: memes, error: memesErr } = await sb
    .from("memes")
    .select("id, title, cached_url, like_count")
    .eq("notified", false)
    .order("like_count", { ascending: false })
    .limit(BATCH_SIZE);

  if (memesErr) {
    console.error("Fetch memes error:", memesErr.message);
    return new Response(`DB error: ${memesErr.message}`, { status: 500 });
  }
  if (!memes || memes.length === 0) {
    return new Response(JSON.stringify({ checked: 0, notified: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let notifiedCount = 0;
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

  for (const meme of memes as Meme[]) {
    // Get the most recent stat recorded BEFORE 1 hour ago
    const { data: history } = await sb
      .from("meme_stats_history")
      .select("like_count, recorded_at")
      .eq("meme_id", meme.id)
      .lt("recorded_at", oneHourAgo)
      .order("recorded_at", { ascending: false })
      .limit(1);

    const oldLikes = (history as StatsRecord[] | null)?.[0]?.like_count ?? 0;
    const delta    = meme.like_count - oldLikes;

    if (delta < SPIKE_THRESHOLD) continue;

    console.log(`Trending: ${meme.id} +${delta} likes in 1h`);

    // Send FCM push via legacy HTTP API
    const fcmRes = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: "/topics/all",
        priority: "high",
        notification: {
          title: "🔥 迷因爆紅了！",
          body:  meme.title ?? "有新的爆紅迷因，快來看看！",
          image: meme.cached_url ?? undefined,
          sound: "default",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        data: {
          meme_id: meme.id,
          type:    "trending",
          delta:   String(delta),
        },
      }),
    });

    if (!fcmRes.ok) {
      const body = await fcmRes.text();
      console.error(`FCM error for ${meme.id}: ${fcmRes.status} ${body}`);
      continue;
    }

    // Mark meme as notified so we don't spam
    await sb
      .from("memes")
      .update({ notified: true })
      .eq("id", meme.id);

    // Record current stats snapshot
    await sb.from("meme_stats_history").insert({
      meme_id:    meme.id,
      like_count: meme.like_count,
    });

    notifiedCount++;
  }

  const result = { checked: memes.length, notified: notifiedCount };
  console.log("trending-alert result:", result);
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
