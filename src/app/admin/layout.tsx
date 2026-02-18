import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/admin" className="font-semibold text-stone-800">
            Admin
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="text-stone-600 hover:text-amber-700">
              Dashboard
            </Link>
            <Link href="/admin/cashier" className="text-stone-600 hover:text-amber-700">
              Cashier
            </Link>
            <Link href="/admin/analytics" className="text-stone-600 hover:text-amber-700">
              Analytics
            </Link>
            <Link href="/admin/orders" className="text-stone-600 hover:text-amber-700">
              Orders
            </Link>
            <Link href="/admin/menu" className="text-stone-600 hover:text-amber-700">
              Menu
            </Link>
            <Link href="/admin/qr" className="text-stone-600 hover:text-amber-700">
              QR codes
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
