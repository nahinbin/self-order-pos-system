import { prisma } from "./prisma";
import type { Decimal } from "@prisma/client/runtime/library";

const toNum = (d: Decimal | null | undefined): number => (d == null ? 0 : Number(d));

export type Table = { id: number; name: string; created_at: string };
export type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  image_url?: string | null;
  price: number;
  category: string;
  available: number;
  sort_order: number;
};
export type Order = {
  id: number;
  table_id: number;
  order_type: "dine_in" | "takeaway";
  status: string;
  payment_method: string | null;
  payment_status: string;
  total: number;
  customer_notes: string | null;
  created_at: string;
  table_name?: string;
  preparing_started_at?: string | null;
  served_at?: string | null;
  preparing_duration_seconds?: number | null;
};
export type OrderItem = {
  id: number;
  order_id: number;
  menu_item_id: number | null;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
  options_json?: string | null;
};
export type ItemOption = {
  id: number;
  option_group_id: number;
  name: string;
  price_modifier: number;
  is_default: number;
  sort_order: number;
  unavailable?: boolean;
};
export type OptionGroup = {
  id: number;
  menu_item_id: number;
  name: string;
  required: number;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  options?: ItemOption[];
};
export type MenuItemWithOptions = MenuItem & { option_groups?: OptionGroup[]; unavailable?: boolean };

export function getDefaultRestaurantId(): number {
  const id = process.env.DEFAULT_RESTAURANT_ID;
  if (id != null && id !== "") return Number(id) || 1;
  return 1;
}

export type DictionaryItemType = "item" | "category";

/** Food dictionary: names (and optional type). Used for product/option names (type=item) and menu categories (type=category). Categories ordered by sortOrder then name. */
export function getFoodDictionary(
  restaurantId: number,
  search?: string,
  type?: DictionaryItemType
): Promise<{ id: number; name: string; type: string; sort_order?: number }[]> {
  const where: { restaurantId: number; name?: { contains: string; mode: "insensitive" }; type?: string } = {
    restaurantId,
  };
  if (search?.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  if (type) {
    where.type = type;
  }
  const orderBy = type === "category"
    ? [{ sortOrder: "asc" as const }, { name: "asc" as const }]
    : [{ name: "asc" as const }];
  return prisma.foodDictionaryItem
    .findMany({
      where,
      orderBy,
      select: { id: true, name: true, type: true, sortOrder: true },
    })
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        ...(type === "category" && { sort_order: r.sortOrder }),
      }))
    );
}

export async function addFoodDictionaryItem(
  restaurantId: number,
  name: string,
  itemType: DictionaryItemType = "item"
): Promise<{ id: number; name: string; type: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const existing = await prisma.foodDictionaryItem.findFirst({
    where: { restaurantId, name: trimmed },
    select: { id: true, name: true, type: true },
  });
  if (existing) return existing;
  const created = await prisma.foodDictionaryItem.create({
    data: { restaurantId, name: trimmed, type: itemType },
    select: { id: true, name: true, type: true },
  });
  return created;
}

/** Update category order. orderedIds = category (dictionary item) ids in desired order. */
export async function updateCategoryOrder(
  restaurantId: number,
  orderedIds: number[]
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.foodDictionaryItem.updateMany({
        where: { id, restaurantId, type: "category" },
        data: { sortOrder: index },
      })
    )
  );
}

/** Reorder menu items within a category. itemIds = menu item ids in desired order (must all belong to category). */
export async function updateMenuItemsOrderInCategory(
  restaurantId: number,
  category: string,
  itemIds: number[]
): Promise<void> {
  const valid = await prisma.menuItem.findMany({
    where: { restaurantId, category, id: { in: itemIds } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((r) => r.id));
  const ordered = itemIds.filter((id) => validIds.has(id));
  await Promise.all(
    ordered.map((id, index) =>
      prisma.menuItem.updateMany({
        where: { id, restaurantId, category },
        data: { sortOrder: index },
      })
    )
  );
}

/** Normalize name for unavailable matching: trim, lowercase, collapse spaces. */
function normalizeNameForUnavailable(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Names (from dictionary) that are currently marked unavailable. Used to flag menu items. */
export async function getUnavailableDictionaryNames(restaurantId: number): Promise<Set<string>> {
  const entries = await prisma.unavailableEntry.findMany({
    where: { restaurantId },
    include: { foodDictionaryItem: { select: { name: true } } },
  });
  const names = entries
    .map((e) => e.foodDictionaryItem?.name)
    .filter((n): n is string => typeof n === "string")
    .map(normalizeNameForUnavailable);
  return new Set(names);
}

/** For admin: list of unavailable entries with id, name, dictionaryItemId. */
export async function getUnavailableList(restaurantId: number): Promise<{ id: number; name: string; food_dictionary_item_id: number }[]> {
  const entries = await prisma.unavailableEntry.findMany({
    where: { restaurantId },
    include: { foodDictionaryItem: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return entries.map((e) => ({
    id: e.id,
    name: e.foodDictionaryItem.name,
    food_dictionary_item_id: e.foodDictionaryItemId,
  }));
}

export async function addUnavailableEntry(restaurantId: number, foodDictionaryItemId: number): Promise<void> {
  const existing = await prisma.unavailableEntry.findFirst({
    where: { restaurantId, foodDictionaryItemId },
  });
  if (existing) return;
  await prisma.unavailableEntry.create({
    data: { restaurantId, foodDictionaryItemId },
  });
}

export async function removeUnavailableEntry(restaurantId: number, entryId: number): Promise<void> {
  await prisma.unavailableEntry.deleteMany({
    where: { id: entryId, restaurantId },
  });
}

export function getTables(restaurantId: number): Promise<Table[]> {
  return prisma.restaurantTable
    .findMany({
      where: { restaurantId },
      orderBy: { id: "asc" },
      select: { id: true, name: true, createdAt: true },
    })
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        created_at: r.createdAt.toISOString(),
      }))
    );
}

export function addTable(restaurantId: number, name: string): Promise<Table> {
  return prisma.restaurantTable
    .create({
      data: { restaurantId, name },
      select: { id: true, name: true, createdAt: true },
    })
    .then((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.createdAt.toISOString(),
    }));
}

/** Ensure a default "Counter" table exists for orders without an assigned table. */
export async function getOrCreateCounterTable(restaurantId: number): Promise<Table> {
  const existing = await prisma.restaurantTable.findFirst({
    where: { restaurantId, name: "Counter" },
    select: { id: true, name: true, createdAt: true },
  });
  if (existing) {
    return { id: existing.id, name: existing.name, created_at: existing.createdAt.toISOString() };
  }
  const created = await prisma.restaurantTable.create({
    data: { restaurantId, name: "Counter" },
    select: { id: true, name: true, createdAt: true },
  });
  return { id: created.id, name: created.name, created_at: created.createdAt.toISOString() };
}

export async function addTables(restaurantId: number, count: number): Promise<void> {
  if (count < 1 || count > 100) return;
  const max = await prisma.restaurantTable.findFirst({
    where: { restaurantId },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const start = (max?.id ?? 0) + 1;
  await prisma.restaurantTable.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      restaurantId,
      name: `Table ${start + i}`,
    })),
  });
}

export function getTableById(restaurantId: number, id: number): Promise<Table | undefined> {
  return prisma.restaurantTable
    .findFirst({
      where: { id, restaurantId },
      select: { id: true, name: true, createdAt: true },
    })
    .then((r) =>
      r
        ? {
            id: r.id,
            name: r.name,
            created_at: r.createdAt.toISOString(),
          }
        : undefined
    );
}

async function getOptionGroupsForItem(menuItemId: number): Promise<OptionGroup[]> {
  const groups = await prisma.optionGroup.findMany({
    where: { menuItemId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      options: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    menu_item_id: g.menuItemId,
    name: g.name,
    required: g.required,
    min_selections: g.minSelections,
    max_selections: g.maxSelections,
    sort_order: g.sortOrder,
    options: g.options.map((o) => ({
      id: o.id,
      option_group_id: o.optionGroupId,
      name: o.name,
      price_modifier: toNum(o.priceModifier),
      is_default: o.isDefault,
      sort_order: o.sortOrder,
    })),
  }));
}

/** Load all option groups (with options) for many menu items in 1 query. Avoids N+1. */
async function getOptionGroupsByMenuItemIds(menuItemIds: number[]): Promise<Map<number, OptionGroup[]>> {
  if (menuItemIds.length === 0) return new Map();
  const groups = await prisma.optionGroup.findMany({
    where: { menuItemId: { in: menuItemIds } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      options: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  const byMenuItemId = new Map<number, OptionGroup[]>();
  for (const g of groups) {
    const list = byMenuItemId.get(g.menuItemId) ?? [];
    list.push({
      id: g.id,
      menu_item_id: g.menuItemId,
      name: g.name,
      required: g.required,
      min_selections: g.minSelections,
      max_selections: g.maxSelections,
      sort_order: g.sortOrder,
      options: g.options.map((o) => ({
        id: o.id,
        option_group_id: o.optionGroupId,
        name: o.name,
        price_modifier: toNum(o.priceModifier),
        is_default: o.isDefault,
        sort_order: o.sortOrder,
      })),
    });
    byMenuItemId.set(g.menuItemId, list);
  }
  return byMenuItemId;
}

/** Category name -> display order (from dictionary sortOrder). Lower = first. */
async function getCategoryOrderMap(restaurantId: number): Promise<Map<string, number>> {
  const cats = await prisma.foodDictionaryItem.findMany({
    where: { restaurantId, type: "category" },
    orderBy: { sortOrder: "asc" },
    select: { name: true, sortOrder: true },
  });
  const map = new Map<string, number>();
  cats.forEach((c, i) => map.set(c.name, i));
  return map;
}

export async function getMenuItems(restaurantId: number): Promise<MenuItemWithOptions[]> {
  const [unavailableNames, categoryOrder, items] = await Promise.all([
    getUnavailableDictionaryNames(restaurantId),
    getCategoryOrderMap(restaurantId),
    prisma.menuItem.findMany({
      where: { restaurantId, available: 1 },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const optionGroupsByItemId = await getOptionGroupsByMenuItemIds(items.map((i) => i.id));
  const withOptions = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.imageUrl ?? null,
    price: toNum(item.price),
    category: item.category,
    available: item.available,
    sort_order: item.sortOrder,
    option_groups: (optionGroupsByItemId.get(item.id) ?? []).map((g) => ({
      ...g,
      options: (g.options ?? []).map((o) => ({
        ...o,
        unavailable: unavailableNames.has(normalizeNameForUnavailable(o.name)),
      })),
    })),
    unavailable: unavailableNames.has(normalizeNameForUnavailable(item.name)),
  }));
  const catOrder = (c: string) => categoryOrder.get(c) ?? 999;
  withOptions.sort((a, b) => {
    const oa = catOrder(a.category);
    const ob = catOrder(b.category);
    if (oa !== ob) return oa - ob;
    return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  });
  return withOptions;
}

export async function getMenuItemsAdmin(restaurantId: number): Promise<MenuItemWithOptions[]> {
  const [unavailableNames, categoryOrder, items] = await Promise.all([
    getUnavailableDictionaryNames(restaurantId),
    getCategoryOrderMap(restaurantId),
    prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const optionGroupsByItemId = await getOptionGroupsByMenuItemIds(items.map((i) => i.id));
  const withOptions = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.imageUrl ?? null,
    price: toNum(item.price),
    category: item.category,
    available: item.available,
    sort_order: item.sortOrder,
    option_groups: (optionGroupsByItemId.get(item.id) ?? []).map((g) => ({
      ...g,
      options: (g.options ?? []).map((o) => ({
        ...o,
        unavailable: unavailableNames.has(normalizeNameForUnavailable(o.name)),
      })),
    })),
    unavailable: unavailableNames.has(normalizeNameForUnavailable(item.name)),
  }));
  const catOrder = (c: string) => categoryOrder.get(c) ?? 999;
  withOptions.sort((a, b) => {
    const oa = catOrder(a.category);
    const ob = catOrder(b.category);
    if (oa !== ob) return oa - ob;
    return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  });
  return withOptions;
}

export async function getMenuItemById(
  restaurantId: number,
  id: number
): Promise<MenuItemWithOptions | undefined> {
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId },
  });
  if (!item) return undefined;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.imageUrl ?? null,
    price: toNum(item.price),
    category: item.category,
    available: item.available,
    sort_order: item.sortOrder,
    option_groups: await getOptionGroupsForItem(item.id),
  };
}

export async function createMenuItem(
  restaurantId: number,
  data: {
    name: string;
    description?: string | null;
    image_url?: string | null;
    price: number;
    category: string;
    available?: number;
    sort_order?: number;
  }
): Promise<MenuItem> {
  const item = await prisma.menuItem.create({
    data: {
      restaurantId,
      name: data.name,
      description: data.description ?? null,
      imageUrl: data.image_url ?? null,
      price: data.price,
      category: data.category,
      available: data.available ?? 1,
      sortOrder: data.sort_order ?? 0,
    },
  });
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.imageUrl ?? null,
    price: toNum(item.price),
    category: item.category,
    available: item.available,
    sort_order: item.sortOrder,
  };
}

export async function updateMenuItem(
  restaurantId: number,
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    image_url: string | null;
    price: number;
    category: string;
    available: number;
    sort_order: number;
  }>
): Promise<void> {
  // Update imageUrl via raw SQL. If column is missing (42703), add it then retry to avoid holding pool for two queries on every save.
  if (data.image_url !== undefined) {
    try {
      await prisma.$executeRaw`
        UPDATE "MenuItem" SET "imageUrl" = ${data.image_url} WHERE id = ${id} AND "restaurantId" = ${restaurantId}
      `;
    } catch (e: unknown) {
      const err = e as { code?: string; meta?: { code?: string } };
      if (err.code === "P2010" && err.meta?.code === "42703") {
        await prisma.$executeRawUnsafe('ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
        await prisma.$executeRaw`
          UPDATE "MenuItem" SET "imageUrl" = ${data.image_url} WHERE id = ${id} AND "restaurantId" = ${restaurantId}
        `;
      } else {
        console.error("MenuItem imageUrl update failed:", e);
        throw e;
      }
    }
  }
  const rest: Record<string, unknown> = {};
  if (data.name !== undefined) rest.name = data.name;
  if (data.description !== undefined) rest.description = data.description;
  if (data.price !== undefined) rest.price = data.price;
  if (data.category !== undefined) rest.category = data.category;
  if (data.available !== undefined) rest.available = data.available;
  if (data.sort_order !== undefined) rest.sortOrder = data.sort_order;
  if (Object.keys(rest).length > 0) {
    await prisma.menuItem.updateMany({
      where: { id, restaurantId },
      data: rest,
    });
  }
}

export async function deleteMenuItem(restaurantId: number, id: number): Promise<void> {
  await prisma.menuItem.deleteMany({ where: { id, restaurantId } });
}

export async function createOptionGroup(
  restaurantId: number,
  data: {
    menu_item_id: number;
    name: string;
    required?: number;
    min_selections?: number;
    max_selections?: number;
    sort_order?: number;
  }
): Promise<OptionGroup> {
  const group = await prisma.optionGroup.create({
    data: {
      menuItemId: data.menu_item_id,
      name: data.name,
      required: data.required ?? 1,
      minSelections: data.min_selections ?? 1,
      maxSelections: data.max_selections ?? 1,
      sortOrder: data.sort_order ?? 0,
    },
  });
  return {
    id: group.id,
    menu_item_id: group.menuItemId,
    name: group.name,
    required: group.required,
    min_selections: group.minSelections,
    max_selections: group.maxSelections,
    sort_order: group.sortOrder,
  };
}

export async function updateOptionGroup(
  id: number,
  data: Partial<{
    name: string;
    required: number;
    min_selections: number;
    max_selections: number;
    sort_order: number;
  }>
): Promise<void> {
  await prisma.optionGroup.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.required !== undefined && { required: data.required }),
      ...(data.min_selections !== undefined && { minSelections: data.min_selections }),
      ...(data.max_selections !== undefined && { maxSelections: data.max_selections }),
      ...(data.sort_order !== undefined && { sortOrder: data.sort_order }),
    },
  });
}

export async function deleteOptionGroup(id: number): Promise<void> {
  await prisma.optionGroup.delete({ where: { id } });
}

export async function createItemOption(data: {
  option_group_id: number;
  name: string;
  price_modifier?: number;
  is_default?: number;
  sort_order?: number;
}): Promise<ItemOption> {
  const opt = await prisma.itemOption.create({
    data: {
      optionGroupId: data.option_group_id,
      name: data.name,
      priceModifier: data.price_modifier ?? 0,
      isDefault: data.is_default ?? 0,
      sortOrder: data.sort_order ?? 0,
    },
  });
  return {
    id: opt.id,
    option_group_id: opt.optionGroupId,
    name: opt.name,
    price_modifier: toNum(opt.priceModifier),
    is_default: opt.isDefault,
    sort_order: opt.sortOrder,
  };
}

export async function updateItemOption(
  id: number,
  data: Partial<{ name: string; price_modifier: number; is_default: number; sort_order: number }>
): Promise<void> {
  await prisma.itemOption.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.price_modifier !== undefined && { priceModifier: data.price_modifier }),
      ...(data.is_default !== undefined && { isDefault: data.is_default }),
      ...(data.sort_order !== undefined && { sortOrder: data.sort_order }),
    },
  });
}

export async function deleteItemOption(id: number): Promise<void> {
  await prisma.itemOption.delete({ where: { id } });
}

export async function getOrders(
  restaurantId: number,
  limit = 100,
  shiftId?: number | null
): Promise<(Order & { items?: OrderItem[] })[]> {
  const where: { restaurantId: number; shiftId?: number } = { restaurantId };
  if (shiftId != null) where.shiftId = shiftId;
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      table: { select: { name: true } },
      items: true,
    },
  });
  return orders.map((o) => ({
    id: o.id,
    table_id: o.tableId,
    order_type: o.orderType as "dine_in" | "takeaway",
    status: o.status,
    payment_method: o.paymentMethod,
    payment_status: o.paymentStatus,
    total: toNum(o.total),
    customer_notes: o.customerNotes,
    created_at: o.createdAt.toISOString(),
    table_name: o.table.name,
    preparing_started_at: o.preparingStartedAt ? o.preparingStartedAt.toISOString() : null,
    served_at: o.servedAt ? o.servedAt.toISOString() : null,
    preparing_duration_seconds: o.preparingDurationSeconds ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      order_id: it.orderId,
      menu_item_id: it.menuItemId,
      name: it.name,
      price: toNum(it.price),
      quantity: it.quantity,
      notes: it.notes,
      options_json: it.optionsJson,
    })),
  }));
}

export async function getOrderById(
  restaurantId: number,
  id: number
): Promise<(Order & { table_name?: string; items?: OrderItem[] }) | undefined> {
  const o = await prisma.order.findFirst({
    where: { id, restaurantId },
    include: { table: { select: { name: true } }, items: true },
  });
  if (!o) return undefined;
  return {
    id: o.id,
    table_id: o.tableId,
    order_type: o.orderType as "dine_in" | "takeaway",
    status: o.status,
    payment_method: o.paymentMethod,
    payment_status: o.paymentStatus,
    total: toNum(o.total),
    customer_notes: o.customerNotes,
    created_at: o.createdAt.toISOString(),
    table_name: o.table.name,
    preparing_started_at: o.preparingStartedAt ? o.preparingStartedAt.toISOString() : null,
    served_at: o.servedAt ? o.servedAt.toISOString() : null,
    preparing_duration_seconds: o.preparingDurationSeconds ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      order_id: it.orderId,
      menu_item_id: it.menuItemId,
      name: it.name,
      price: toNum(it.price),
      quantity: it.quantity,
      notes: it.notes,
      options_json: it.optionsJson,
    })),
  };
}

export async function createOrder(
  restaurantId: number,
  data: {
    table_id: number;
    order_type: "dine_in" | "takeaway";
    items: {
      menu_item_id: number;
      name: string;
      price: number;
      quantity: number;
      notes?: string;
      options_json?: string | null;
    }[];
    total: number;
    customer_notes?: string;
    shift_id?: number | null;
  }
): Promise<{ id: number; order: Order & { table_name?: string; items?: OrderItem[] } }> {
  const order = await prisma.order.create({
    data: {
      restaurantId,
      tableId: data.table_id,
      shiftId: data.shift_id ?? null,
      orderType: data.order_type,
      total: data.total,
      customerNotes: data.customer_notes || null,
      items: {
        create: data.items.map((it) => ({
          menuItemId: it.menu_item_id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          notes: it.notes || null,
          optionsJson: it.options_json ?? null,
        })),
      },
    },
    include: {
      table: { select: { name: true } },
      items: true,
    },
  });
  const payload: Order & { table_name?: string; items?: OrderItem[] } = {
    id: order.id,
    table_id: order.tableId,
    order_type: order.orderType as "dine_in" | "takeaway",
    status: order.status,
    payment_method: order.paymentMethod,
    payment_status: order.paymentStatus,
    total: toNum(order.total),
    customer_notes: order.customerNotes,
    created_at: order.createdAt.toISOString(),
    table_name: order.table.name,
    preparing_started_at: order.preparingStartedAt ? order.preparingStartedAt.toISOString() : null,
    served_at: order.servedAt ? order.servedAt.toISOString() : null,
    preparing_duration_seconds: order.preparingDurationSeconds ?? null,
    items: order.items.map((it) => ({
      id: it.id,
      order_id: it.orderId,
      menu_item_id: it.menuItemId,
      name: it.name,
      price: toNum(it.price),
      quantity: it.quantity,
      notes: it.notes,
      options_json: it.optionsJson,
    })),
  };
  return { id: order.id, order: payload };
}

export async function updateOrderPayment(
  restaurantId: number,
  orderId: number,
  payment_method: "online" | "cash",
  payment_status: "paid" | "pending" = "paid"
): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, restaurantId },
    data: { paymentMethod: payment_method, paymentStatus: payment_status },
  });

  // If this order is already completed and now fully paid, strip noisy fields.
  if (payment_status === "paid") {
    const o = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { status: true },
    });
    if (o?.status === "served") {
      await pruneCompletedOrderDetails(restaurantId, orderId);
    }
  }
}

export async function updateOrderStatus(
  restaurantId: number,
  orderId: number,
  status: string
): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, restaurantId },
    data: { status },
  });
}

/** Update order status and automatically maintain timing fields for preparing/served. */
export async function updateOrderStatusWithTiming(
  restaurantId: number,
  orderId: number,
  status: string
): Promise<void> {
  const now = new Date();

  if (status === "preparing") {
    // When starting preparation, capture start time (if not already set) and clear served/duration.
    await prisma.order.updateMany({
      where: { id: orderId, restaurantId },
      data: {
        status,
        preparingStartedAt: now,
        servedAt: null,
        preparingDurationSeconds: null,
      },
    });
    return;
  }

  if (status === "served") {
    const existing = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: {
        createdAt: true,
        preparingStartedAt: true,
      },
    });
    if (!existing) return;
    const start = existing.preparingStartedAt ?? existing.createdAt;
    const seconds = Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));

    await prisma.order.updateMany({
      where: { id: orderId, restaurantId },
      data: {
        status,
        servedAt: now,
        preparingDurationSeconds: seconds,
      },
    });

    // If the order is already paid, strip noisy fields immediately.
    const paid = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { paymentStatus: true },
    });
    if (paid?.paymentStatus === "paid") {
      await pruneCompletedOrderDetails(restaurantId, orderId);
    }
    return;
  }

  // Other statuses (e.g. pending, cancelled) just update the status.
  await prisma.order.updateMany({
    where: { id: orderId, restaurantId },
    data: { status },
  });
}

/**
 * Reduce "completed" order data to essentials:
 * - keep totals and item name/price/qty for receipts + analytics
 * - remove options_json / notes and customer notes to avoid messy storage
 */
export async function pruneCompletedOrderDetails(restaurantId: number, orderId: number): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, restaurantId },
    data: { customerNotes: null },
  });
  await prisma.orderItem.updateMany({
    where: { orderId },
    data: { notes: null, optionsJson: null },
  });
}

// ── Shift management ──────────────────────────────────────────────

export type Shift = {
  id: number;
  started_at: string;
  ended_at: string | null;
};

export async function getCurrentShift(restaurantId: number): Promise<Shift | null> {
  const shift = await prisma.shift.findFirst({
    where: { restaurantId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!shift) return null;
  return {
    id: shift.id,
    started_at: shift.startedAt.toISOString(),
    ended_at: null,
  };
}

export async function startShift(restaurantId: number): Promise<Shift> {
  // End any currently open shift first
  await prisma.shift.updateMany({
    where: { restaurantId, endedAt: null },
    data: { endedAt: new Date() },
  });
  const shift = await prisma.shift.create({
    data: { restaurantId },
  });
  return {
    id: shift.id,
    started_at: shift.startedAt.toISOString(),
    ended_at: null,
  };
}

export async function endShift(restaurantId: number): Promise<Shift | null> {
  const open = await prisma.shift.findFirst({
    where: { restaurantId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) return null;
  const ended = await prisma.shift.update({
    where: { id: open.id },
    data: { endedAt: new Date() },
  });
  return {
    id: ended.id,
    started_at: ended.startedAt.toISOString(),
    ended_at: ended.endedAt!.toISOString(),
  };
}

export { prisma };
export default prisma;
