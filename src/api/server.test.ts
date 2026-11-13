import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Call, client } from '../testing/http-client.ts';
import { type Api, startApi } from './server.ts';

let api: Api;
let call: Call;
beforeEach(async () => {
  api = await startApi();
  call = client(api.url);
});
afterEach(() => api.close());

const emails = (list: { data: { email: string }[] }) => list.data.map((c) => c.email);

describe('contacts API', () => {
  it('POST /contacts creates and returns 201 { object, id }; GET returns the contact with the defaults filled in', async () => {
    const created = await call('POST', '/contacts', { email: 'ana@example.com', first_name: 'Ana' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ object: 'contact', id: expect.any(String) });
    const got = await call('GET', `/contacts/${created.body.id}`);
    expect(got.body).toMatchObject({ email: 'ana@example.com', first_name: 'Ana', last_name: null, unsubscribed: false });
  });

  it('the response does not leak internal store fields (seq)', async () => {
    const { body } = await call('POST', '/contacts', { email: 'ana@example.com' });
    expect(Object.keys((await call('GET', `/contacts/${body.id}`)).body).sort()).toEqual(
      ['created_at', 'email', 'first_name', 'id', 'last_name', 'object', 'unsubscribed'],
    );
  });

  it('errors always have the same shape { statusCode, name, message }', async () => {
    const cases = [
      [await client(api.url, null)('GET', '/contacts'), 401, 'missing_api_key'],
      [await call('POST', '/contacts', '{"email":'), 400, 'validation_error'],
      [await call('POST', '/contacts', {}), 422, 'missing_required_field'],
      [await call('GET', '/contacts/does-not-exist'), 404, 'not_found'],
      [await call('GET', '/domains'), 404, 'not_found'],
      [await call('PATCH', '/contacts'), 405, 'method_not_allowed'],
    ] as const;
    for (const [res, status, name] of cases) {
      expect(res.status).toBe(status);
      expect(res.body).toEqual({ statusCode: status, name, message: expect.any(String) });
    }
  });

  it('DELETE removes the contact, and a second DELETE gets 404', async () => {
    const { body } = await call('POST', '/contacts', { email: 'ana@example.com' });
    expect((await call('DELETE', `/contacts/${body.id}`)).body).toEqual({ object: 'contact', id: body.id, deleted: true });
    expect((await call('DELETE', `/contacts/${body.id}`)).status).toBe(404);
  });

  it('GET /contacts paginates by offset: limit + offset, newest first', async () => {
    for (let i = 0; i < 5; i++) await call('POST', '/contacts', { email: `c${i}@example.com` });
    const p1 = await call('GET', '/contacts?limit=2');
    expect(p1.body).toMatchObject({ object: 'list', has_more: true });
    expect(emails(p1.body)).toEqual(['c4@example.com', 'c3@example.com']);
    const p3 = await call('GET', '/contacts?limit=2&offset=4');
    expect(emails(p3.body)).toEqual(['c0@example.com']);
    expect(p3.body.has_more).toBe(false);
  });

  it('an invalid query becomes 422 validation_error with an actionable message', async () => {
    const res = await call('GET', '/contacts?limit=500');
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('`limit` must be less than or equal to 100.');
    expect((await call('GET', '/contacts?page=2')).body.message).toContain('Unknown field `page`');
  });
});
