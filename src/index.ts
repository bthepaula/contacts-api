// Public API: the contract, the server, pagination and the OpenAPI tooling.
// The helpers in src/testing/ are left out on purpose: they exist for tests and the benchmark.
export {
  Contact, ContactList, CreateContactRequest, CreateContactResponse, DeleteContactResponse, ErrorName, ErrorResponse,
  ListContactsQuery, type CreateContactData, type CreateContactInput,
} from './contract/schemas.ts';
export { ApiError, fromZodError } from './contract/errors.ts';
export { ContactStore, type Row } from './api/store.ts';
export { pageByCursor, pageByOffset, type Page } from './api/pagination.ts';
export { startApi, type Api } from './api/server.ts';
export { buildOpenApi } from './spec/openapi.ts';
export { contractChecker } from './spec/checker.ts';
