export interface SmokeResult {
  name: string;
  ok: boolean;
  detail?: string;
}

type Check = (baseUrl: string) => Promise<SmokeResult>;

const healthz: Check = async (base) => {
  const res = await fetch(`${base}/healthz`);
  return { name: 'healthz', ok: res.status === 200, detail: `status ${res.status}` };
};

const protectedResource: Check = async (base) => {
  const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const ok = res.status === 200 && 'resource' in body && 'authorization_servers' in body;
  return { name: 'oauth-protected-resource', ok, detail: `status ${res.status}` };
};

const mcpRequiresAuth: Check = async (base) => {
  const res = await fetch(`${base}/mcp`, { method: 'POST' });
  const ok = res.status === 401 && res.headers.has('www-authenticate');
  return { name: 'mcp-requires-auth', ok, detail: `status ${res.status}` };
};

export const CHECKS: Record<string, Check> = {
  healthz,
  'oauth-protected-resource': protectedResource,
  'mcp-requires-auth': mcpRequiresAuth,
};

export async function runSmoke(baseUrl: string, names: string[]): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  for (const name of names) {
    const check = CHECKS[name];
    if (!check) throw new Error(`Unknown smoke check: ${name}`);
    try {
      results.push(await check(baseUrl));
    } catch (err) {
      results.push({ name, ok: false, detail: err instanceof Error ? err.message : 'failed' });
    }
  }
  return results;
}

async function main(): Promise<void> {
  const [baseUrl, checks = 'healthz'] = process.argv.slice(2);
  if (!baseUrl) throw new Error('usage: smoke.ts <baseUrl> [check1,check2]');
  const results = await runSmoke(baseUrl, checks.split(','));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

if (process.argv[1]?.endsWith('smoke.ts')) await main();
