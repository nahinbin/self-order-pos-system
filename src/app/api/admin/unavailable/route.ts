import { NextResponse } from "next/server";
import { getUnavailableList, addUnavailableEntry } from "@/lib/db";
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
    const list = await getUnavailableList(restaurantId);
    return NextResponse.json(list);
  } catch (e) {
    return handleDbError(e, "Failed to load unavailable list");
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json();
    const foodDictionaryItemId = body?.food_dictionary_item_id ?? body?.foodDictionaryItemId;
    if (foodDictionaryItemId == null || !Number(foodDictionaryItemId)) {
      return NextResponse.json({ error: "food_dictionary_item_id is required" }, { status: 400 });
    }
    await addUnavailableEntry(restaurantId, Number(foodDictionaryItemId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleDbError(e, "Failed to add to unavailable list");
  }
}
