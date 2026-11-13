// In-memory contact store. In production this would be a Postgres table with an index on (created_at, id).
import { randomUUID } from 'node:crypto';
import type { Contact, CreateContactData } from '../contract/schemas.ts';

// seq is the internal sort key (it grows on every insert). It never leaves the API.
export type Row = { seq: number; contact: Contact };

export class ContactStore {
  private rows: Row[] = []; // insertion order (seq ascending)
  // id → seq, kept after a delete: a cursor that points to a deleted contact still works
  private seqById = new Map<string, number>();
  private nextSeq = 1;

  constructor(
    private newId: () => string = () => randomUUID(),
    private now: () => Date = () => new Date(),
  ) {}

  create(data: CreateContactData): Contact {
    const contact: Contact = {
      object: 'contact',
      id: this.newId(),
      email: data.email,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      unsubscribed: data.unsubscribed,
      created_at: this.now().toISOString(),
    };
    const seq = this.nextSeq++;
    this.rows.push({ seq, contact });
    this.seqById.set(contact.id, seq);
    return contact;
  }

  get(id: string): Contact | undefined {
    return this.rows.find((row) => row.contact.id === id)?.contact;
  }

  remove(id: string): boolean {
    const index = this.rows.findIndex((row) => row.contact.id === id);
    if (index === -1) return false;
    this.rows.splice(index, 1);
    return true;
  }

  // Newest first: the order the list endpoint documents
  newestFirst(): Row[] {
    return [...this.rows].reverse();
  }

  seqOf(id: string): number | undefined {
    return this.seqById.get(id);
  }

  get size(): number {
    return this.rows.length;
  }
}
