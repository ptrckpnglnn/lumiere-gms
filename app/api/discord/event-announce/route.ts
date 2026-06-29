// app/api/discord/event-announce/route.ts
import { NextRequest, NextResponse } from "next/server";
import { postEventAnnouncement } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { name, date, time, type } = await req.json();
    if (!name || !date || !type)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    await postEventAnnouncement({ name, date, time, type });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to post announcement" }, { status: 500 });
  }
}