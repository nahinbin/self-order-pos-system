import { NextResponse } from "next/server";
import { updateCategoryOrder } from "@/lib/db";
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
    const order = body?.order;
    if (!Array.isArray(order) || order.some((id: unknown) => typeof id !== "number")) {
      return NextResponse.json(
        { error: "Body must be { order: number[] } (category dictionary ids in desired order)" },
        { status: 400 }
      );
    }
    await updateCategoryOrder(restaurantId, order);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleDbError(e, "Failed to update category order");
  }
}
