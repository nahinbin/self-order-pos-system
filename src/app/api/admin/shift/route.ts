import { NextResponse } from "next/server";
import { getCurrentShift, startShift, endShift } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const shift = await getCurrentShift(restaurantId);
    return NextResponse.json({ shift });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load shift" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json();
    const action = body.action as string;

    if (action === "start") {
      const shift = await startShift(restaurantId);
      return NextResponse.json({ shift });
    }

    if (action === "end") {
      const shift = await endShift(restaurantId);
      return NextResponse.json({ shift });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update shift" }, { status: 500 });
  }
}
