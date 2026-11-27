import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unpinnedFromLines } from './check-pins.js';

const digest = 'a'.repeat(64);

describe('digest pin check', () => {
  it('UC-DEPLOY-09: flags FROM lines without a sha256 digest', () => {
    const file = `FROM node:26 AS build\nFROM gcr.io/x@sha256:${digest}\n`;
    expect(unpinnedFromLines(file)).toEqual(['FROM node:26 AS build']);
  });

  it('UC-DEPLOY-09: every FROM line in the repository Dockerfile is pinned', () => {
    const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
    expect(unpinnedFromLines(dockerfile)).toEqual([]);
  });
});
