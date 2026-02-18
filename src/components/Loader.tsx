"use client";

export default function Loader({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-8 ${className}`} aria-label="Loading">
      <div
        className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"
        role="progressbar"
      />
    </div>
  );
}
