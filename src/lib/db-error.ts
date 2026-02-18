/** Return true if the error is "can't reach database" (Neon paused, network, etc.). */
export function isDbUnreachableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes("connection refused") ||
    msg.includes("econnrefused") ||
    (msg.includes("timeout") && msg.includes("connect"))
  );
}

/** Get a user-friendly message for API responses when the DB is unreachable. */
export function dbUnreachableMessage(): string {
  return "Database unavailable. If you use Neon, open your Neon dashboard to wake the project, then try again.";
}
