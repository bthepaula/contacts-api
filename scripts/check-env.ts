// Checks the environment: Node 20+ brings fetch and node:http, and Zod 4 brings z.toJSONSchema,
// which later turns the schemas into the OpenAPI document.
import * as z from 'zod';
import { seeded } from '../src/testing/random.ts';

const major = Number(process.versions.node.split('.')[0]);
const emailOk = z.email().safeParse('ana@example.com').success;
const hasJsonSchema = typeof z.toJSONSchema === 'function';
const random = seeded(42);

console.log(`Node ${process.versions.node} ${major >= 20 ? 'ok' : 'TOO OLD: install Node 20+'}`);
console.log(`zod: z.email() ${emailOk ? 'ok' : 'failed'} · z.toJSONSchema ${hasJsonSchema ? 'ok' : 'missing (install zod 4)'}`);
console.log(`seeded random: ${[random(), random(), random()].map((n) => n.toFixed(3)).join(', ')}`);
