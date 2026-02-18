import { NextResponse } from "next/server";
import { getMenuItems } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const items = await getMenuItems(restaurantId);
    return NextResponse.json(items);
  } catch (e) {
    console.error(e);
    if (isDbUnreachableError(e)) {
      return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}
