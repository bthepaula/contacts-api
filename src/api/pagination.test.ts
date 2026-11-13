import { describe, expect, it } from 'vitest';
import { type Page, pageByCursor, pageByOffset } from './pagination.ts';

type R = { seq: number; id: string };

// A live list, newest first, with seq growing on every insert
function list(n: number) {
  let rows: R[] = [];
  let next = 1;
  const add = (count = 1) => {
    for (let i = 0; i < count; i++) {
      rows.unshift({ seq: next, id: `c${next}` });
      next++;
    }
  };
  const remove = (ids: string[]) => {
    rows = rows.filter((row) => !ids.includes(row.id));
  };
  add(n);
  return { rows: () => rows, add, remove };
}

// Walks the whole list; between() runs between two pages (other clients writing)
function walkOffset(get: () => R[], limit: number, between: (page: number) => void = () => {}) {
  const seen: string[] = [];
  let offset = 0;
  for (let p = 0; ; p++) {
    const page: Page<R> = pageByOffset(get(), limit, offset);
    seen.push(...page.data.map((row) => row.id));
    if (!page.has_more) return seen;
    offset += limit;
    between(p);
  }
}
function walkCursor(get: () => R[], limit: number, between: (page: number) => void = () => {}) {
  const seen: string[] = [];
  let after: number | undefined;
  for (let p = 0; ; p++) {
    const page = pageByCursor(get(), { limit, after });
    seen.push(...page.data.map((row) => row.id));
    if (!page.has_more) return seen;
    after = page.data.at(-1)!.seq;
    between(p);
  }
}
const duplicates = (ids: string[]) => ids.length - new Set(ids).size;

describe('pagination', () => {
  it('a list that does not change: offset and cursor see the same 45 items, in 3 pages', () => {
    const l = list(45);
    expect(walkOffset(l.rows, 20)).toEqual(walkCursor(l.rows, 20));
    expect(new Set(walkCursor(l.rows, 20)).size).toBe(45);
  });

  it('has_more is false on the last page, even when the total is a multiple of the limit', () => {
    const l = list(40);
    const p2 = pageByCursor(l.rows(), { limit: 20, after: pageByCursor(l.rows(), { limit: 20 }).data.at(-1)!.seq });
    expect(p2.data).toHaveLength(20);
    expect(p2.has_more).toBe(false);
  });

  it('3 inserts between pages: offset returns 3 duplicates, cursor none', () => {
    const a = list(45);
    const b = list(45);
    expect(duplicates(walkOffset(a.rows, 20, (p) => p === 0 && a.add(3)))).toBe(3);
    expect(duplicates(walkCursor(b.rows, 20, (p) => p === 0 && b.add(3)))).toBe(0);
  });

  it('3 deletes on a page already read: offset skips 3 items that still exist, cursor skips none', () => {
    const a = list(45);
    const b = list(45);
    const seenA = walkOffset(a.rows, 20, (p) => p === 0 && a.remove(['c45', 'c44', 'c43']));
    const seenB = walkCursor(b.rows, 20, (p) => p === 0 && b.remove(['c45', 'c44', 'c43']));
    const survivors = a.rows().map((row) => row.id);
    expect(survivors.filter((id) => !seenA.includes(id))).toEqual(['c25', 'c24', 'c23']);
    expect(survivors.filter((id) => !seenB.includes(id))).toEqual([]);
  });

  it('before returns the page right before the cursor', () => {
    const l = list(45);
    const p1 = pageByCursor(l.rows(), { limit: 20 });
    const p2 = pageByCursor(l.rows(), { limit: 20, after: p1.data.at(-1)!.seq });
    const back = pageByCursor(l.rows(), { limit: 20, before: p2.data[0]!.seq });
    expect(back.data).toEqual(p1.data);
    expect(back.has_more).toBe(false);
  });
});
