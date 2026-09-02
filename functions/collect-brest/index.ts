import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHECKPOINT_ID =
  Deno.env.get("BREST_CHECKPOINT_ID") ??
  "a9173a85-3fc0-424c-84f0-defa632481e4";

const MONITORING_URL =
  `https://belarusborder.by/info/monitoring-new?token=test&checkpointId=${CHECKPOINT_ID}`;
const STATS_URL =
  `https://belarusborder.by/info/statistics?token=test&checkpointId=${CHECKPOINT_ID}`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parseApiDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{2}):(\d{2}):(\d{2}) (\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, hh, mm, ss, dd, mo, yyyy] = m;
  // Brest API timestamps are local time. This uses +02:00 for the current project period.
  return new Date(`${yyyy}-${mo}-${dd}T${hh}:${mm}:${ss}+02:00`);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async () => {
  try {
    const [mRes, sRes] = await Promise.all([
      fetch(MONITORING_URL, { headers: { accept: "application/json" } }),
      fetch(STATS_URL, { headers: { accept: "application/json" } }),
    ]);

    if (!mRes.ok || !sRes.ok) {
      throw new Error(`Source API error: monitoring=${mRes.status}, statistics=${sRes.status}`);
    }

    const monitoring = await mRes.json();
    const stats = await sRes.json();
    const vehicles = Array.isArray(monitoring?.carLiveQueue)
      ? monitoring.carLiveQueue
      : [];

    const capturedAt = new Date().toISOString();
    const waitingCars = vehicles.filter((v: any) => Number(v?.status) === 2).length;
    const calledCars = vehicles.filter((v: any) => Number(v?.status) === 3).length;

    const { error: snapshotError } = await supabase
      .from("queue_snapshots")
      .insert({
        checkpoint_id: CHECKPOINT_ID,
        captured_at: capturedAt,
        waiting_cars: waitingCars,
        called_cars: calledCars,
        monitoring_count: vehicles.length,
        source_statistics: stats,
      });

    if (snapshotError) throw snapshotError;

    const { error: statsError } = await supabase
      .from("processing_stats")
      .insert({
        checkpoint_id: CHECKPOINT_ID,
        captured_at: capturedAt,
        car_last_hour: Number(stats?.carLastHour ?? 0),
        car_last_day: Number(stats?.carLastDay ?? 0),
        raw: stats,
      });

    if (statsError) throw statsError;

    const events = [];
    for (const v of vehicles) {
      const regnum = typeof v?.regnum === "string"
        ? v.regnum.trim().toUpperCase()
        : "";
      const status = Number(v?.status);
      if (!regnum || ![2, 3].includes(status)) continue;

      const registrationAt = parseApiDate(v?.registration_date);
      const changedAt = parseApiDate(v?.changed_date);
      const waitSeconds =
        registrationAt && changedAt && changedAt >= registrationAt
          ? Math.floor((changedAt.getTime() - registrationAt.getTime()) / 1000)
          : null;

      events.push({
        checkpoint_id: CHECKPOINT_ID,
        vehicle_hash: await sha256Hex(regnum),
        status,
        queue_type: v?.type_queue == null ? null : Number(v.type_queue),
        registration_at: registrationAt?.toISOString() ?? null,
        changed_at: changedAt?.toISOString() ?? null,
        observed_at: capturedAt,
        wait_seconds: waitSeconds,
      });
    }

    if (events.length) {
      const { error: eventError } = await supabase
        .from("vehicle_events")
        .upsert(events, {
          onConflict: "checkpoint_id,vehicle_hash,status,changed_at",
          ignoreDuplicates: true,
        });
      if (eventError) throw eventError;
    }

    return Response.json({
      ok: true,
      capturedAt,
      waitingCars,
      calledCars,
      carLastHour: Number(stats?.carLastHour ?? 0),
      carLastDay: Number(stats?.carLastDay ?? 0),
      eventsStored: events.length,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
