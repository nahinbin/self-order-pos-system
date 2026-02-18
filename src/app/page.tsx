import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-lg">
          <h1 className="text-3xl sm:text-4xl font-semibold text-stone-800 mb-3">
            Welcome
          </h1>
          <p className="text-stone-600 text-lg mb-2">
            Dine in or take away. Scan the QR code at your table to order.
          </p>
          <p className="text-stone-500 text-sm">
            No app download — order straight from your phone.
          </p>
        </div>
      </main>

      <footer className="py-8 px-4 border-t border-stone-200 bg-white/80">
        <div className="max-w-lg mx-auto text-center">
          <Link
            href="/admin"
            className="inline-block text-sm text-stone-500 hover:text-amber-700 font-medium underline underline-offset-2"
          >
            Login as admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
