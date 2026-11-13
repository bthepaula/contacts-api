// Checks a real response against the OpenAPI document with Ajv (JSON Schema 2020-12), NOT with Zod:
// whoever consumes the spec (an SDK generator, a partner's client) never runs our Zod schemas.
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

// ajv-formats is CommonJS: under NodeNext its default import may arrive wrapped in { default }
const addFormats = ((addFormatsModule as { default?: unknown }).default ?? addFormatsModule) as typeof addFormatsModule.default;

type Response = { content?: Record<string, { schema: unknown }> };
type Doc = { paths: Record<string, Record<string, { responses: Record<string, Response> }>>; components: unknown };

const DOC_ID = 'openapi.json';

export function contractChecker(doc: Record<string, unknown>) {
  const { paths, components } = doc as Doc;
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  // The whole components tree becomes one schema with a known $id, so a "#/components/schemas/Contact"
  // ref inside it (ContactList → Contact) resolves against it. "components" is not a JSON Schema keyword,
  // so it is declared as an annotation-only keyword to keep strict mode on.
  ajv.addKeyword('components');
  ajv.addSchema({ $id: DOC_ID, components }, DOC_ID);

  // One compiled validator per response schema, built on first use
  const validators = new Map<unknown, ValidateFunction>();
  const validatorFor = (schema: unknown): ValidateFunction => {
    let validate = validators.get(schema);
    if (!validate) {
      const { $ref } = schema as { $ref?: string };
      validate = $ref?.startsWith('#') ? ajv.compile({ $ref: DOC_ID + $ref }) : ajv.compile(schema as object);
      validators.set(schema, validate);
    }
    return validate;
  };

  return function check(op: string, status: number, body: unknown): string[] {
    const [method = '', path = ''] = op.split(' ');
    const operation = paths[path]?.[method.toLowerCase()];
    if (!operation) return [`${op}: operation is not in the document`];

    const response = operation.responses[String(status)];
    if (!response) {
      return [`${op}: status ${status} is not declared (declared: ${Object.keys(operation.responses).join(', ')})`];
    }

    const schema = response.content?.['application/json']?.schema;
    if (schema === undefined) return []; // no content: no body to validate

    const validate = validatorFor(schema);
    if (validate(body)) return [];
    return (validate.errors ?? []).map((e) => `${op} ${status}: ${e.instancePath || '(root)'} ${e.message}`);
  };
}
