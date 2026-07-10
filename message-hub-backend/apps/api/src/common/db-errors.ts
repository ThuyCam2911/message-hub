/** Postgres foreign key violation (23503) — surfaced by TypeORM either directly on the error or nested under driverError, depending on version. */
export function isForeignKeyViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { driverError?: { code?: string } })?.driverError?.code;
  return code === '23503';
}
