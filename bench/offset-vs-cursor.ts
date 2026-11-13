// Export 1,000 contacts page by page while other clients create and delete contacts between pages.
// Every row faces the same seeded writes, so the differences come only from the pagination strategy.
import { pageByCursor, pageByOffset } from '../src/api/pagination.ts';
import { ContactStore } from '../src/api/store.ts';
import { seeded } from '../src/testing/random.ts';

const TOTAL = 1000;
const LIMIT = 50;
type Strategy = 'offset' | 'cursor';
type Writes = { inserts: number; deletes: number };

function storeWith(total: number): ContactStore {
  const store = new ContactStore();
  for (let i = 0; i < total; i++) store.create({ email: `c${i}@example.com`, unsubscribed: false });
  return store;
}

// Other clients: new contacts on top, then deletes at random positions
function otherClients(store: ContactStore, { inserts, deletes }: Writes): () => void {
  const random = seeded(7);
  let created = 0;
  return () => {
    for (let i = 0; i < inserts; i++) store.create({ email: `new${created++}@example.com`, unsubscribed: false });
    for (let i = 0; i < deletes; i++) {
      const rows = store.newestFirst();
      store.remove(rows[Math.floor(random() * rows.length)]!.contact.id);
    }
  };
}

// Walks the whole list, calling between() after every page that has more; returns the ids received, in order
function exportAll(store: ContactStore, strategy: Strategy, between: () => void) {
  const received: string[] = [];
  let pages = 0;
  let offset = 0;
  let after: number | undefined;
  for (;;) {
    const rows = store.newestFirst();
    const page = strategy === 'offset' ? pageByOffset(rows, LIMIT, offset) : pageByCursor(rows, { limit: LIMIT, after });
    pages++;
    received.push(...page.data.map((row) => row.contact.id));
    if (!page.has_more) return { pages, received };
    offset += LIMIT;
    after = page.data.at(-1)!.seq;
    between();
  }
}

function run(strategy: Strategy, writes: Writes) {
  const store = storeWith(TOTAL);
  const atStart = new Set(store.newestFirst().map((row) => row.contact.id));
  const { pages, received } = exportAll(store, strategy, otherClients(store, writes));
  const unique = new Set(received);
  // "skipped": existed at the start, still exists at the end, and never showed up on any page
  const skipped = store.newestFirst().filter((row) => atStart.has(row.contact.id) && !unique.has(row.contact.id)).length;
  return {
    strategy,
    'writes per page': writes.inserts || writes.deletes ? `+${writes.inserts} −${writes.deletes}` : 'none',
    pages,
    received: received.length,
    duplicates: received.length - unique.size,
    skipped,
  };
}

const none = { inserts: 0, deletes: 0 };
const churn = { inserts: 5, deletes: 2 };
const deletesOnly = { inserts: 0, deletes: 10 };

console.log(`${TOTAL} contacts · limit ${LIMIT} · newest first · writes between pages`);
console.table([
  run('offset', none),
  run('cursor', none),
  run('offset', churn),
  run('cursor', churn),
  run('offset', deletesOnly),
  run('cursor', deletesOnly),
]);
