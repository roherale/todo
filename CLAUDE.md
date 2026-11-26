# Rules for AI agents working in this repo

Read [`docs/use-cases/`](docs/use-cases/) before writing or changing behaviour. The design decisions live in a separate private notes repo; ask the owner before changing architecture.

## Repository rules

- **Never add Claude (or any AI) as a co-author or contributor** in commit messages, PR titles or PR descriptions. No `Co-Authored-By` trailers, and no "Generated with" lines.
- **Never mention the names of technologies used in this project** in commit messages, PR titles or PR descriptions. Describe the change by what it does, e.g. "Add task trash restore endpoint", not by the library or service behind it.

## Test integrity (non-negotiable)

- **Never edit, delete, skip or weaken an existing test or assertion to make it pass.** If a test looks wrong, stop and ask the owner, explaining why.
- **Fix the code, not the test**, unless the owner has approved a change to the use case in `docs/use-cases/`.
- Every test name starts with the ID of the acceptance criterion it covers, e.g. `it('UC-TRASH-03: …')`. Don't write code for a use case whose file isn't marked `Approved`.
- Never mock the thing under test. Integration tests (`*.int.test.ts` and `packages/api/test/`) use real Postgres and the real HTTP layer.
- Never use `.skip`, `.only` or `.todo`, add `@ts-ignore` or `eslint-disable` to tests, or write tests without assertions.
- Don't lower the coverage or mutation thresholds.

## Architecture guardrails

- Business rules live only in `*.service.ts`. REST controllers and MCP tools both call the service and never duplicate its logic.
- Services and repositories never import `express`. Modules import each other only through their `index.ts`.
- Every repository method takes `ownerId` and filters on it. Another user's resources return `404`.
- Never log the `Authorization` header, tokens, session cookies or IDs, or task titles and notes.
- **This repo is public.** Never commit secrets, emails, the cloud project ID, the deployed service URL, or any infrastructure identifier. Read them from CI variables and secrets. Never copy design reasoning from the private notes into this repo.
