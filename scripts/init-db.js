const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(process.cwd(), "restaurant.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    available INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    order_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    total REAL NOT NULL,
    customer_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (table_id) REFERENCES tables(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

const tableCount = db.prepare("SELECT COUNT(*) as c FROM tables").get();
if (tableCount.c === 0) {
  const insert = db.prepare("INSERT INTO tables (name) VALUES (?)");
  for (let i = 1; i <= 20; i++) insert.run(`Table ${i}`);
  console.log("Inserted 20 default tables.");
}

const menuCount = db.prepare("SELECT COUNT(*) as c FROM menu_items").get();
if (menuCount.c === 0) {
  const insert = db.prepare(
    "INSERT INTO menu_items (name, description, price, category, sort_order) VALUES (?, ?, ?, ?, ?)"
  );
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
  defaultMenu.forEach((row, i) => insert.run(...row));
  console.log("Inserted default menu.");
}

db.close();
console.log("Database initialized at", dbPath);
