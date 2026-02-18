import { NextResponse } from "next/server";
import { getTables, addTable, addTables } from "@/lib/db";
import { getRestaurantIdFromRequest } from "@/lib/tenant";
import { isDbUnreachableError, dbUnreachableMessage } from "@/lib/db-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function handleDbError(e: unknown) {
  console.error(e);
  if (isDbUnreachableError(e)) {
    return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
  }
  return NextResponse.json({ error: "Failed to load tables" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const tables = await getTables(restaurantId);
    return NextResponse.json(tables);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(request: Request) {
  try {
    const restaurantId = getRestaurantIdFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const { name, count } = body;
    if (count != null) {
      const n = Math.min(100, Math.max(1, Number(count) | 0));
      await addTables(restaurantId, n);
      const tables = await getTables(restaurantId);
      return NextResponse.json({ tables, added: n });
    }
    if (typeof name === "string" && name.trim()) {
      const table = await addTable(restaurantId, name.trim());
      const tables = await getTables(restaurantId);
      return NextResponse.json({ tables, added: table });
    }
    return NextResponse.json({ error: "Send name (string) or count (number)" }, { status: 400 });
  } catch (e) {
    return handleDbError(e);
  }
}
