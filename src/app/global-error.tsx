"use client";

export default function GlobalError(props: {
  error?: Error & { digest?: string };
  reset?: () => void;
}) {
  const error = props?.error;
  const reset = props?.reset;

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4 font-sans">
        <h1 className="text-xl font-semibold text-stone-800 mb-2">Something went wrong</h1>
        <p className="text-stone-600 text-sm mb-4 text-center max-w-sm">
          {error?.message || "An unexpected error occurred."}
        </p>
        {typeof reset === "function" && (
          <button
            type="button"
            onClick={() => reset()}
            className="py-2.5 px-5 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700"
          >
            Try again
          </button>
        )}
      </body>
    </html>
  );
}
