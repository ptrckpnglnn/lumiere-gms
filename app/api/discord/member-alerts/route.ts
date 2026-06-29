// app/api/discord/member-alerts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { postMemberAlerts } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { atRisk, inactive } = await req.json();
    if (!atRisk || !inactive)
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    await postMemberAlerts(atRisk, inactive);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}