/** Every timestamp column in `schema.sql` holds unix seconds, never milliseconds. */
export function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
