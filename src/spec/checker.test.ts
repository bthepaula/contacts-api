import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Api, startApi } from '../api/server.ts';
import { client } from '../testing/http-client.ts';
import { contractChecker } from './checker.ts';
import { buildOpenApi } from './openapi.ts';

const check = contractChecker(buildOpenApi());
let api: Api;
beforeAll(async () => {
  api = await startApi();
});
afterAll(() => api.close());

describe('contract: REAL responses against the OpenAPI document', () => {
  it('every scenario returns a declared status and a body that matches its schema', async () => {
    const call = client(api.url);
    const created = await call('POST', '/contacts', { email: 'ana@example.com', last_name: 'Smith' });
    const id = created.body.id;
    const scenarios: [string, { status: number; body: unknown }][] = [
      ['POST /contacts', created],
      ['POST /contacts', await call('POST', '/contacts', { first_name: 'No email' })],
      ['POST /contacts', await call('POST', '/contacts', 'this is not JSON')],
      ['POST /contacts', await client(api.url, null)('POST', '/contacts', { email: 'bia@example.com' })],
      ['GET /contacts', await call('GET', '/contacts?limit=1')],
      ['GET /contacts', await call('GET', '/contacts?limit=0')],
      ['GET /contacts/{id}', await call('GET', `/contacts/${id}`)],
      ['GET /contacts/{id}', await call('GET', '/contacts/does-not-exist')],
      ['DELETE /contacts/{id}', await call('DELETE', `/contacts/${id}`)],
      ['DELETE /contacts/{id}', await call('DELETE', `/contacts/${id}`)],
    ];
    const violations = scenarios.flatMap(([op, res]) => check(op, res.status, res.body));
    expect(violations).toEqual([]);
    expect(new Set(scenarios.map(([, r]) => r.status))).toEqual(new Set([201, 422, 400, 401, 200, 404]));
  });

  it('catches a renamed field (first_name → firstName): an SDK generated from the spec would break', () => {
    const drifted = { object: 'contact', id: 'x', email: 'ana@example.com', firstName: 'Ana', last_name: null, unsubscribed: false, created_at: '2026-01-01T00:00:01.000Z' };
    expect(check('GET /contacts/{id}', 200, drifted)).toEqual([
      "GET /contacts/{id} 200: (root) must have required property 'first_name'",
      'GET /contacts/{id} 200: (root) must NOT have additional properties',
    ]);
  });

  it('catches a status the API returns but the spec does not declare', () => {
    expect(check('GET /contacts/{id}', 409, {})).toEqual(['GET /contacts/{id}: status 409 is not declared (declared: 200, 401, 404)']);
  });

  it('catches an error outside the standard shape', () => {
    expect(check('GET /contacts/{id}', 404, { error: 'not found' })).toHaveLength(4);
  });
});
