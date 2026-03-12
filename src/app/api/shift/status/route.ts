import { NextResponse } from "next/server";
import { getCurrentShift } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const shift = await getCurrentShift(restaurantId);
    return NextResponse.json({ open: shift !== null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ open: true });
  }
}
