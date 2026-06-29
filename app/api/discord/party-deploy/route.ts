// app/api/discord/party-deploy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { postPartyDeployment } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { parties } = await req.json();
    if (!parties || !Array.isArray(parties))
      return NextResponse.json({ error: "Missing parties" }, { status: 400 });
    await postPartyDeployment(parties);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}