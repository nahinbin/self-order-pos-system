import { NextResponse } from "next/server";
import { getFoodDictionary, addFoodDictionaryItem } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function handleDbError(e: unknown, fallback = "Failed") {
  console.error(e);
  if (isDbUnreachableError(e)) {
    return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const type = searchParams.get("type");
    const itemType = type === "category" || type === "item" ? type : undefined;
    const items = await getFoodDictionary(restaurantId, q || undefined, itemType);
    return NextResponse.json(items);
  } catch (e) {
    return handleDbError(e, "Failed to load dictionary");
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json();
    const name = body?.name;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const type = body?.type;
    const itemType = type === "category" || type === "item" ? type : "item";
    const item = await addFoodDictionaryItem(restaurantId, name, itemType);
    return NextResponse.json(item);
  } catch (e) {
    return handleDbError(e, "Failed to add to dictionary");
  }
}
