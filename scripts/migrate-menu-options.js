const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(process.cwd(), "restaurant.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS option_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    required INTEGER DEFAULT 1,
    min_selections INTEGER DEFAULT 1,
    max_selections INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS item_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price_modifier REAL DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (option_group_id) REFERENCES option_groups(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_option_groups_menu ON option_groups(menu_item_id);
  CREATE INDEX IF NOT EXISTS idx_item_options_group ON item_options(option_group_id);
`);

try {
  db.exec("ALTER TABLE order_items ADD COLUMN options_json TEXT");
} catch (e) {
  if (!e.message.includes("duplicate column")) throw e;
}

db.close();
console.log("Migration complete: option_groups, item_options, order_items.options_json");
