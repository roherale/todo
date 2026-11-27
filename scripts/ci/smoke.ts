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

export interface SmokeOptions {
  /** How many times to try a check before reporting it failed. A cold revision may need a moment. */
  attempts?: number;
  delayMs?: number;
}

async function attempt(check: Check, name: string, baseUrl: string): Promise<SmokeResult> {
  try {
    return await check(baseUrl);
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : 'failed' };
  }
}

export async function runSmoke(baseUrl: string, names: string[], options: SmokeOptions = {}): Promise<SmokeResult[]> {
  const attempts = options.attempts ?? 1;
  const results: SmokeResult[] = [];
  for (const name of names) {
    const check = CHECKS[name];
    if (!check) throw new Error(`Unknown smoke check: ${name}`);
    let result = await attempt(check, name, baseUrl);
    for (let i = 1; i < attempts && !result.ok; i++) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 0));
      result = await attempt(check, name, baseUrl);
    }
    results.push(result);
  }
  return results;
}

async function main(): Promise<void> {
  const [baseUrl, checks = 'healthz'] = process.argv.slice(2);
  if (!baseUrl) throw new Error('usage: smoke.ts <baseUrl> [check1,check2]');
  // A freshly started revision (and a database waking up) can take a few tries to answer.
  const results = await runSmoke(baseUrl, checks.split(','), { attempts: 6, delayMs: 5000 });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

if (process.argv[1]?.endsWith('smoke.ts')) await main();
