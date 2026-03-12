import { NextResponse } from "next/server";
import { updateMenuItemsOrderInCategory } from "@/lib/db";
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

export async function PUT(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json();
    const category = body?.category;
    const itemIds = body?.itemIds;
    if (typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ error: "Body must include category (string)" }, { status: 400 });
    }
    if (!Array.isArray(itemIds) || itemIds.some((id: unknown) => typeof id !== "number")) {
      return NextResponse.json(
        { error: "Body must include itemIds: number[] (menu item ids in desired order)" },
        { status: 400 }
      );
    }
    await updateMenuItemsOrderInCategory(restaurantId, category.trim(), itemIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleDbError(e, "Failed to reorder menu items");
  }
}
