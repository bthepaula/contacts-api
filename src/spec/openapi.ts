// OpenAPI 3.1 generated from the SAME Zod schemas the API validates with: one source of truth.
// In 3.1 the Schema Object is JSON Schema 2020-12, which is exactly what z.toJSONSchema produces by default.
import * as z from 'zod';
import {
  Contact, ContactList, CreateContactRequest, CreateContactResponse, DeleteContactResponse, ErrorResponse, ListContactsQuery,
} from '../src/contract/schemas.ts';

type Json = Record<string, unknown>;
const ref = (id: string) => `#/components/schemas/${id}`;

// Requests use io 'input' (what the client MAY send: fields with a default are optional);
// responses use io 'output' (what the server ALWAYS returns: fields with a default are required).
function componentSchemas(): Record<string, Json> {
  const requests = z.registry<{ id: string }>();
  requests.add(CreateContactRequest, { id: 'CreateContactRequest' });
  const responses = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries({ Contact, ContactList, CreateContactResponse, DeleteContactResponse, ErrorResponse })) {
    responses.add(schema, { id });
  }
  const all = {
    ...z.toJSONSchema(requests, { io: 'input', uri: ref }).schemas,
    ...z.toJSONSchema(responses, { io: 'output', uri: ref }).schemas,
  } as Record<string, Json>;
  // A $schema and an $id per component make no sense inside an OpenAPI document
  for (const schema of Object.values(all)) {
    delete schema.$schema;
    delete schema.$id;
  }
  return all;
}

// Each property of the query becomes an "in: query" parameter
function queryParameters(schema: z.ZodType): Json[] {
  const js = z.toJSONSchema(schema, { io: 'input' }) as { properties: Record<string, Json>; required?: string[] };
  return Object.entries(js.properties).map(([name, { description, ...rest }]) => ({
    in: 'query', name, required: js.required?.includes(name) ?? false, description, schema: rest,
  }));
}

const json = (id: string, description: string) => ({ description, content: { 'application/json': { schema: { $ref: ref(id) } } } });
const error = (description: string) => json('ErrorResponse', description);
const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'The contact id.' };

// Routes and status codes are written by hand: they are design decisions, not types
export function buildOpenApi(): Json {
  return {
    openapi: '3.1.0',
    info: { title: 'Contacts API', version: '1.0.0', description: 'A contacts API in the style of the Resend API.' },
    servers: [{ url: 'http://127.0.0.1:{port}', variables: { port: { default: '3000' } } }],
    security: [{ bearerAuth: [] }],
    paths: {
      '/contacts': {
        post: {
          operationId: 'createContact', summary: 'Create a contact',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: ref('CreateContactRequest') } } } },
          responses: {
            '201': json('CreateContactResponse', 'Created'),
            '400': error('The body is not JSON'),
            '401': error('Missing API key'),
            '422': error('Validation failed: missing_required_field or validation_error'),
          },
        },
        get: {
          operationId: 'listContacts', summary: 'List contacts, newest first, paginated by cursor',
          parameters: queryParameters(ListContactsQuery),
          responses: {
            '200': json('ContactList', 'One page'),
            '401': error('Missing API key'),
            '422': error('limit outside 1..100, after and before together, or an unknown cursor'),
          },
        },
      },
      '/contacts/{id}': {
        get: {
          operationId: 'getContact', summary: 'Retrieve a contact', parameters: [idParam],
          responses: { '200': json('Contact', 'The contact'), '401': error('Missing API key'), '404': error('Not found') },
        },
        delete: {
          operationId: 'deleteContact', summary: 'Delete a contact', parameters: [idParam],
          responses: { '200': json('DeleteContactResponse', 'Deleted'), '401': error('Missing API key'), '404': error('Not found') },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas: componentSchemas(),
    },
  };
}
