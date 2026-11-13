import { describe, expect, it } from 'vitest';
import { buildOpenApi } from './openapi.ts';

type Schema = { required?: string[]; properties: Record<string, any>; $id?: string; $schema?: string };
type Op = { operationId: string; parameters?: any[]; responses: Record<string, any> };
const doc = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, Op>>; components: { schemas: Record<string, Schema> } };
const ops = Object.values(doc.paths).flatMap((p) => Object.values(p));
const schemas = doc.components.schemas;

describe('OpenAPI generated from Zod', () => {
  it('is 3.1, and every operation has a unique operationId and a 2xx response', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(new Set(ops.map((o) => o.operationId)).size).toBe(ops.length);
    for (const op of ops) expect(Object.keys(op.responses).some((s) => s.startsWith('2'))).toBe(true);
  });

  it('the request uses io input: only email is required, and the default shows up', () => {
    expect(schemas.CreateContactRequest!.required).toEqual(['email']);
    expect(schemas.CreateContactRequest!.properties.unsubscribed.default).toBe(false);
  });

  it('the response uses io output: unsubscribed is required, and nullable fields are ["string", "null"]', () => {
    expect(schemas.Contact!.required).toContain('unsubscribed');
    expect(schemas.Contact!.properties.first_name.type).toEqual(['string', 'null']);
  });

  it('every 4xx response points to the same ErrorResponse', () => {
    const errors = ops.flatMap((o) => Object.entries(o.responses).filter(([s]) => s.startsWith('4')).map(([, r]) => r));
    expect(errors.length).toBeGreaterThanOrEqual(8);
    for (const r of errors) expect(r.content['application/json'].schema.$ref).toBe('#/components/schemas/ErrorResponse');
    expect(schemas.ErrorResponse!.properties.name.enum).toContain('missing_required_field');
  });

  it('the list query becomes parameters: limit is an integer 1..100 (default 20), after and before are optional', () => {
    const params = doc.paths['/contacts']!.get!.parameters!;
    expect(params.map((p) => [p.name, p.required])).toEqual([['limit', false], ['after', false], ['before', false]]);
    expect(params[0].schema).toEqual({ default: 20, type: 'integer', minimum: 1, maximum: 100 });
  });

  it('components carry no stray $id or $schema', () => {
    for (const s of Object.values(schemas)) {
      expect(s.$id).toBeUndefined();
      expect(s.$schema).toBeUndefined();
    }
  });
});
