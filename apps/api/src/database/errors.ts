// Error Postgres unique_violation — drizzle membungkus error driver di `cause`
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (Reflect.get(current, "code") === "23505") return true;
  }
  return false;
}
