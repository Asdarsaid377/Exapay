// Error Postgres dari driver — drizzle membungkus error driver di `cause`
function pgErrorOf(error: unknown, code: string): Error | null {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (Reflect.get(current, "code") === code) return current;
  }
  return null;
}

// Nama constraint yang dilanggar (unique index, FK, check), jika ada
function constraintOf(error: Error | null): string | null {
  const name: unknown = error ? Reflect.get(error, "constraint") : null;
  return typeof name === "string" ? name : null;
}

// unique_violation (23505)
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorOf(error, "23505") !== null;
}

// unique_violation → nama constraint/index (null jika bukan unique violation)
export function uniqueViolationConstraint(error: unknown): string | null {
  return constraintOf(pgErrorOf(error, "23505"));
}

// foreign_key_violation (23503) → nama constraint (null jika bukan FK violation)
export function foreignKeyViolationConstraint(error: unknown): string | null {
  const found = pgErrorOf(error, "23503");
  return found ? (constraintOf(found) ?? "") : null;
}

// exclusion_violation (23P01) → nama constraint (null jika bukan exclusion violation)
export function exclusionViolationConstraint(error: unknown): string | null {
  const found = pgErrorOf(error, "23P01");
  return found ? (constraintOf(found) ?? "") : null;
}
