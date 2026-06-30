// app/api/discord/reminders/route.ts
// Called by Vercel Cron every 5 minutes
// Checks for events starting in ~1 hour and posts a reminder if not sent yet

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { postEventReminder } from "@/lib/discord";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // needs service role to update reminder_sent
);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const now = new Date();

    // Get today's events in PH time that haven't sent a reminder yet
    const todayPH = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
    );
    const dateStr = todayPH.toISOString().split("T")[0];

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("date", dateStr)
      .eq("reminder_sent", false)
      .not("time", "is", null);

    if (error) throw error;
    if (!events || events.length === 0)
      return NextResponse.json({ message: "No events to remind" });

    const reminders: string[] = [];

    for (const event of events) {
      // Build event datetime in PH time
      const [hours, minutes] = event.time.split(":").map(Number);
      const eventTimePH = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
      );
      eventTimePH.setHours(hours, minutes, 0, 0);

      // Current PH time
      const nowPH = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
      );

      const diffMs      = eventTimePH.getTime() - nowPH.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      // Send reminder if event is 55–65 minutes away (5 min cron window)
      if (diffMinutes >= 55 && diffMinutes <= 65) {
        await postEventReminder({
          name: event.name,
          date: event.date,
          time: event.time,
          type: event.type,
        });

        // Mark reminder as sent
        await supabase
          .from("events")
          .update({ reminder_sent: true })
          .eq("id", event.id);

        reminders.push(event.name);
      }
    }

    return NextResponse.json({
      message: reminders.length
        ? `Reminders sent for: ${reminders.join(", ")}`
        : "No events in reminder window",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}