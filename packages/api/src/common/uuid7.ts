import { randomBytes } from 'node:crypto';

let lastMs = 0;
let seq = 0;

/** UUIDv7 (RFC 9562), monotonic within a process so ids sort in creation order even within one millisecond. */
export function uuidv7(now: number = Date.now()): string {
  let ms = now;
  if (ms <= lastMs) {
    ms = lastMs;
    seq += 1;
    if (seq > 0xfff) {
      ms += 1;
      seq = 0;
    }
  } else {
    seq = randomBytes(2).readUInt16BE() & 0x3ff; // leave headroom for the counter
  }
  lastMs = ms;

  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = 0x70 | (seq >> 8);
  bytes[7] = seq & 0xff;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
