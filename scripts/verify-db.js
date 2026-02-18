const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const [restaurants, tables, menuItems] = await Promise.all([
    p.restaurant.count(),
    p.restaurantTable.count(),
    p.menuItem.count(),
  ]);
  console.log("OK - Restaurants:", restaurants, "| Tables:", tables, "| Menu items:", menuItems);
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
