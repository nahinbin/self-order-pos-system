import { NextResponse } from "next/server";
import { removeUnavailableEntry } from "@/lib/db";
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const restaurantId = getRestaurantIdFromRequest(_request);
    const { id } = await params;
    const entryId = Number(id);
    if (!entryId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await removeUnavailableEntry(restaurantId, entryId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleDbError(e, "Failed to remove from unavailable list");
  }
}
