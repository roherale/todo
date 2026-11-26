#!/usr/bin/env bash
# UC-DEPLOY-08: the runtime image runs as 65532, has no shell, and ships no project TypeScript source or dev dependencies.
set -euo pipefail
image="$1"
user=$(docker image inspect "$image" --format '{{.Config.User}}')
[ "$user" = "65532" ] || { echo "image user is '$user', expected 65532"; exit 1; }
cid=$(docker create "$image")
trap 'docker rm "$cid" >/dev/null' EXIT
listing=$(docker export "$cid" | tar -t)
if echo "$listing" | grep -qE '^(bin|usr/bin)/(sh|bash|dash)$'; then echo "image contains a shell"; exit 1; fi
if echo "$listing" | grep -E '\.ts$' | grep -v '\.d\.ts$' | grep -qE '^app/(src|test)/|node_modules/@todo/'; then echo "image contains project .ts source"; exit 1; fi
if echo "$listing" | grep -qE 'node_modules/\.pnpm/(vitest|typescript|eslint|tsx|supertest)@'; then echo "image contains devDependencies"; exit 1; fi
echo "image checks passed"
