// The contacts API on node:http, in the shape of the Resend API: snake_case JSON, errors as
// { statusCode, name, message }, and lists as { object: 'list', has_more, data } paginated by cursor.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type * as z from 'zod';
import { ApiError, fromZodError } from '../contract/errors.ts';
import {
  Contact, ContactList, CreateContactRequest, CreateContactResponse, DeleteContactResponse, ListContactsQuery,
} from '../contract/schemas.ts';
import { pageByCursor } from './pagination.ts';
import { ContactStore } from './store.ts';

type Reply = { status: number; body: unknown };
export type Api = { url: string; store: ContactStore; close: () => Promise<void> };

const CONTACT_FIELDS = Object.keys(CreateContactRequest.shape);

// Validates the input with the schema; a failure becomes an actionable API error
function parse<S extends z.ZodType>(schema: S, input: unknown, knownFields: readonly string[]): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw fromZodError(result.error, input, knownFields);
  return result.data;
}

// Responses go through their schema too. z.object drops keys that are not in the contract,
// so nothing internal (like seq) ever leaks.
function ok<S extends z.ZodType>(status: number, schema: S, body: z.input<S>): Reply {
  return { status, body: schema.parse(body) };
}

function notFound(id: string): ApiError {
  return new ApiError(404, 'not_found', `Contact ${id} not found. Check the id, or list contacts with GET /contacts.`);
}

// ---------- the four operations ----------
function createContact(store: ContactStore, body: unknown): Reply {
  const contact = store.create(parse(CreateContactRequest, body, CONTACT_FIELDS));
  return ok(201, CreateContactResponse, { object: 'contact', id: contact.id });
}

// The cursor the client sees is a contact id; the store sorts by the seq behind it
function cursorSeq(store: ContactStore, id: string | undefined, param: 'after' | 'before'): number | undefined {
  if (id === undefined) return undefined;
  const seq = store.seqOf(id);
  if (seq === undefined) {
    throw new ApiError(422, 'validation_error',
      `The \`${param}\` cursor does not match any contact. Use the \`id\` of an item from a previous page.`);
  }
  return seq;
}

function listContacts(store: ContactStore, params: URLSearchParams): Reply {
  const q = parse(ListContactsQuery, Object.fromEntries(params), ['limit', 'after', 'before']);
  const page = pageByCursor(store.newestFirst(), {
    limit: q.limit,
    after: cursorSeq(store, q.after, 'after'),
    before: cursorSeq(store, q.before, 'before'),
  });
  return ok(200, ContactList, { object: 'list', has_more: page.has_more, data: page.data.map((row) => row.contact) });
}

function getContact(store: ContactStore, id: string): Reply {
  const contact = store.get(id);
  if (!contact) throw notFound(id);
  return ok(200, Contact, contact);
}

function deleteContact(store: ContactStore, id: string): Reply {
  if (!store.remove(id)) throw notFound(id);
  return ok(200, DeleteContactResponse, { object: 'contact', id, deleted: true });
}

// ---------- routing and HTTP ----------
function route(store: ContactStore, method: string, url: URL, body: unknown): Reply {
  const [, resource, id, extra] = url.pathname.split('/');
  if (resource !== 'contacts' || extra !== undefined) {
    throw new ApiError(404, 'not_found', `The endpoint ${url.pathname} does not exist. Check the URL in the API reference.`);
  }
  if (!id) {
    if (method === 'POST') return createContact(store, body);
    if (method === 'GET') return listContacts(store, url.searchParams);
  } else {
    if (method === 'GET') return getContact(store, id);
    if (method === 'DELETE') return deleteContact(store, id);
  }
  throw new ApiError(405, 'method_not_allowed', `Method ${method} is not allowed on ${url.pathname}.`);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'validation_error', 'The request body is not valid JSON. Send a JSON object with Content-Type: application/json.');
  }
}

async function handle(store: ContactStore, req: http.IncomingMessage): Promise<Reply> {
  try {
    if (!/^Bearer re_\w+$/.test(req.headers.authorization ?? '')) {
      throw new ApiError(401, 'missing_api_key', 'Missing API key. Send it in the Authorization header: `Authorization: Bearer re_...`.');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const body = req.method === 'POST' ? await readJson(req) : undefined;
    return route(store, req.method ?? 'GET', url, body);
  } catch (e) {
    // A known error becomes the contract's JSON; anything else is a generic 500, with no stack trace
    const error = e instanceof ApiError ? e : new ApiError(500, 'application_error', 'Unexpected error. Retry later; if it persists, contact support.');
    return { status: error.statusCode, body: error.toJSON() };
  }
}

// Listens on 127.0.0.1, port 0: the OS picks a free port, so tests never fight over one
export async function startApi(store = new ContactStore()): Promise<Api> {
  const server = http.createServer(async (req, res) => {
    const reply = await handle(store, req);
    res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, store, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
