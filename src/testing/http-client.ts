// A tiny JSON client for the tests: returns the status and the parsed body
export type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;

export function client(baseUrl: string, apiKey: string | null = 're_test_123'): Call {
  return async (method, path, body) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const res = await fetch(baseUrl + path, { method, headers, body: encode(body) });
    return { status: res.status, body: await res.json() };
  };
}

// A string is sent as is (to test a body that is not JSON); anything else is serialized
function encode(body: unknown): string | undefined {
  if (body === undefined || typeof body === 'string') return body;
  return JSON.stringify(body);
}
