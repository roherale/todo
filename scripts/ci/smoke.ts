export interface SmokeResult {
  name: string;
  ok: boolean;
  detail?: string;
}

type Check = (baseUrl: string) => Promise<SmokeResult>;

/** The first 200 characters of a response body, with line breaks flattened, for the failure report. */
async function snippet(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.slice(0, 200).replace(/\s+/g, ' ');
}

/** What went wrong, in a form that helps: the status, and the start of the body when the check failed. */
async function describe(res: Response, ok: boolean): Promise<string> {
  return ok ? `status ${res.status}` : `status ${res.status}, body "${await snippet(res)}"`;
}

const health: Check = async (base) => {
  const res = await fetch(`${base}/health`);
  const ok = res.status === 200;
  return { name: 'health', ok, detail: await describe(res, ok) };
};

const protectedResource: Check = async (base) => {
  const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
  const raw = await res.text().catch(() => '');
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Not JSON: the check fails below and the report shows the start of the body.
  }
  const ok = res.status === 200 && 'resource' in body && 'authorization_servers' in body;
  return {
    name: 'oauth-protected-resource',
    ok,
    detail: ok ? `status ${res.status}` : `status ${res.status}, body "${raw.slice(0, 200).replace(/\s+/g, ' ')}"`,
  };
};

const mcpRequiresAuth: Check = async (base) => {
  const res = await fetch(`${base}/mcp`, { method: 'POST' });
  const ok = res.status === 401 && res.headers.has('www-authenticate');
  return { name: 'mcp-requires-auth', ok, detail: await describe(res, ok) };
};

export const CHECKS: Record<string, Check> = {
  health,
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
  const [baseUrl, checks = 'health'] = process.argv.slice(2);
  if (!baseUrl) throw new Error('usage: smoke.ts <baseUrl> [check1,check2]');
  // A freshly started revision (and a database waking up) can take a few tries to answer.
  const results = await runSmoke(baseUrl, checks.split(','), { attempts: 6, delayMs: 5000 });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
  if (results.some((r) => !r.ok)) {
    // The host name only: enough to tell whether the answer came from the app or from the platform.
    console.log(`Checked host: ${new URL(baseUrl).hostname}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('smoke.ts')) await main();
