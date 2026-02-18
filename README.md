# Restaurant Self Order

Single-restaurant ordering: customers scan a table QR code to order; the cashier dashboard updates in real time via WebSockets.

## Tech

- **Next.js 14** (App Router), **PostgreSQL** (Prisma), **Socket.io** (real-time orders), **Tailwind CSS**
- One restaurant; app runs on port 3000 (or `PORT` in env)
- Custom Node server runs Next.js + Socket.io on the same port

## Quick start

1. **Environment**

   Copy `.env.example` to `.env` and set your PostgreSQL URL:

   ```bash
   cp .env.example .env
   # Edit .env: DATABASE_URL="postgresql://..."
   ```

2. **Install and database**

   ```bash
   npm install
   npx prisma db push
   npm run db:seed
   ```

3. **Run the app**

   ```bash
   npm run dev
   ```

   Opens at **http://localhost:3000** (or http://0.0.0.0:3000 for same-WiFi access).

4. **Pages**

   - **Cashier:** http://localhost:3000/admin — orders; new orders appear in real time
   - **Menu:** http://localhost:3000/admin/menu
   - **QR codes:** http://localhost:3000/admin/qr — print table QR codes
   - **Customer order:** http://localhost:3000/order?table=1 (or scan a QR from admin/qr)

## Real-time cashier

When a new order is placed, the cashier dashboard at `/admin` updates instantly (Socket.io). No refresh needed.

## Scripts

| Command          | Description                          |
|------------------|--------------------------------------|
| `npm run dev`    | Start app (Next + Socket.io on 3000) |
| `npm run build`  | Production build                     |
| `npm run start`  | Run production server               |
| `npm run db:push`| Apply schema to DB                   |
| `npm run db:seed`| Create default restaurant + tables + menu |

## Add more tables

On the admin QR page, enter a number and click **Add tables**. Or:

```bash
curl -X POST http://localhost:3000/api/tables -H "Content-Type: application/json" -d '{"count": 5}'
```
