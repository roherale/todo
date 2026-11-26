import type { Response } from 'express';

const BASE = 'Path=/; HttpOnly; Secure; SameSite=Lax';

/** `__Host-` cookies: Secure, Path=/, no Domain, HttpOnly, SameSite=Lax. */
export function setCookie(res: Response, name: string, value: string, maxAgeSeconds: number): void {
  res.append('Set-Cookie', `${name}=${value}; Max-Age=${maxAgeSeconds}; ${BASE}`);
}

export function clearCookie(res: Response, name: string): void {
  res.append('Set-Cookie', `${name}=; Max-Age=0; ${BASE}`);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
}
