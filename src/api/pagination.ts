// Two ways to page through the SAME list (newest first). Pure functions: no server needed to test them.
export type Page<T> = { data: T[]; has_more: boolean };
type Keyed = { seq: number };

// Offset: "skip N items". The position is a NUMBER, and the number changes meaning when the list changes:
// a new item on top pushes everything one slot down (a duplicate); a deleted item pulls everything up (a skip).
export function pageByOffset<T>(rows: readonly T[], limit: number, offset: number): Page<T> {
  return { data: rows.slice(offset, offset + limit), has_more: offset + limit < rows.length };
}

// Cursor (keyset): "continue after THIS item". The position is the item's sort key,
// which does not change when other items come or go.
//   after:  items older than the cursor (smaller seq), closest first
//   before: items newer than the cursor (larger seq), the page right before it
export function pageByCursor<T extends Keyed>(
  rows: readonly T[], // newest first (seq descending)
  q: { limit: number; after?: number; before?: number },
): Page<T> {
  const { limit, after, before } = q;

  // before: everything newer than the cursor, still newest first. The page right before the
  // cursor is the q.limit items CLOSEST to it, which sit at the END of that list.
  // e.g. c10..c1, before=c5, limit 3: newer = [c10, c9, c8, c7, c6] → page = [c8, c7, c6]
  if (before !== undefined) {
    const newer = rows.filter((row) => row.seq > before);
    const start = Math.max(0, newer.length - limit);
    return { data: newer.slice(start), has_more: start > 0 };
  }

  // after (or no cursor): everything older than the cursor; the page is the first q.limit of it.
  // Comparing by seq, not by finding the cursor's position, keeps a deleted cursor item working.
  const older = after === undefined ? rows : rows.filter((row) => row.seq < after);
  return { data: older.slice(0, limit), has_more: older.length > limit };
}
