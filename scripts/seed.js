const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const defaultMenu = [
  ["Classic Burger", "Beef patty, lettuce, tomato", 12.99, "Mains", 1],
  ["Caesar Salad", "Romaine, parmesan, croutons", 9.99, "Salads", 2],
  ["Fish & Chips", "Beer-battered cod, fries", 14.99, "Mains", 3],
  ["Margherita Pizza", "Tomato, mozzarella, basil", 11.99, "Mains", 4],
  ["Chicken Wings", "6 pcs, choice of sauce", 8.99, "Starters", 5],
  ["French Fries", "Crispy golden fries", 4.99, "Sides", 6],
  ["Iced Tea", "House brewed", 3.49, "Drinks", 7],
  ["Fresh Lemonade", "Fresh squeezed", 4.49, "Drinks", 8],
  ["Coffee", "Espresso or filter", 3.99, "Drinks", 9],
];

async function main() {
  let restaurant = await prisma.restaurant.findFirst({ where: { slug: "default" } });
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: { name: "Default Restaurant", slug: "default" },
    });
    console.log("Created default restaurant:", restaurant.id);
  }

  const tableCount = await prisma.restaurantTable.count({ where: { restaurantId: restaurant.id } });
  if (tableCount === 0) {
    await prisma.restaurantTable.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        restaurantId: restaurant.id,
        name: `Table ${i + 1}`,
      })),
    });
    console.log("Created 20 default tables.");
  }

  const menuCount = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
  if (menuCount === 0) {
    for (const [name, description, price, category, sortOrder] of defaultMenu) {
      await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          name,
          description,
          price,
          category,
          sortOrder,
          available: 1,
        },
      });
    }
    console.log("Created default menu.");
  }

  console.log("Seed done. Default restaurantId:", restaurant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
