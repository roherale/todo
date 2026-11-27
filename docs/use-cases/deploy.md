# UC-DEPLOY: pipeline, image and rollback

**Status:** Approved (2026-11-26)

**How these are tested:**
- The CI helper scripts (the migration check, the test-change check, the smoke runner) live in `scripts/ci/` and have unit tests named after these IDs.
- Workflow behaviour is checked by assertion steps inside the workflows. Each step's `name:` starts with the criterion ID, and the coverage script counts those too.

| ID | Criterion |
|---|---|
| UC-DEPLOY-01 | A new revision is deployed with no traffic and a `candidate` tag. Until the smoke tests pass, the previously live revision keeps 100% of the traffic. |
| UC-DEPLOY-02 | If any smoke check fails, traffic stays on the previous revision, the job fails, and the `candidate` tag is removed. |
| UC-DEPLOY-03 | The smoke runner checks: `/healthz` returns `200`; `/.well-known/oauth-protected-resource` returns `resource` and `authorization_servers`; `/mcp` with no token returns `401` with `WWW-Authenticate`. Once a non-interactive token for a smoke-test user is available, it also runs an authenticated create → get → trash → purge round-trip. |
| UC-DEPLOY-04 | The `rollback` workflow, run with no input, moves 100% of traffic to the revision that was live before the current one. Given a revision name, it moves traffic to that revision. Either way it then requires `/healthz` to return `200`. |
| UC-DEPLOY-05 | The migration check fails when a new migration file contains `DROP`, `RENAME`, or `ALTER … TYPE` (case-insensitive, ignoring SQL comments), unless the PR has the `migration-contract-approved` label. Migrations that only add things pass with no label. |
| UC-DEPLOY-06 | Images are tagged with the full commit SHA, and the pipeline never pushes or deploys a `latest` tag. The image carries the OCI labels `org.opencontainers.image.source` and `org.opencontainers.image.revision`. |
| UC-DEPLOY-07 | Trivy fails the build on any fixable `CRITICAL` or `HIGH` vulnerability. |
| UC-DEPLOY-08 | The runtime image runs as uid `65532`, has no `/bin/sh`, and contains no `devDependencies` and no project TypeScript source (nothing from `packages/*/src`). `.ts` files that ship inside third-party packages are allowed. |
| UC-DEPLOY-09 | Every `FROM` line is pinned by `@sha256:` digest. |
| UC-DEPLOY-10 | `pnpm install` fails on any Node major version other than 26 (`engine-strict`), both locally and in CI. |
| UC-DEPLOY-11 | The Artifact Registry cleanup policy keeps the 10 most recent images. |
| UC-DEPLOY-12 | CI fails if any criterion ID defined in `docs/use-cases/` has no test or workflow step whose name starts with that ID, unless it's listed in the pending-criteria file with the milestone that will cover it. It also fails if a test, workflow step or pending entry names a criterion ID that doesn't exist, or if a pending criterion already has a test. |
| UC-DEPLOY-13 | The deploy's migration step, run against an empty database, applies every migration, and running it again changes nothing. It fails with a clear message that names `DATABASE_URL` when that variable is not set. |
