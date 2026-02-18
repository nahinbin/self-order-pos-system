import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Page not found</h1>
      <p className="text-stone-600 text-sm mb-4">The page you’re looking for doesn’t exist.</p>
      <Link
        href="/"
        className="py-2.5 px-5 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700"
      >
        Go home
      </Link>
    </div>
  );
}
