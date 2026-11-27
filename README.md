# todo

A personal task list you can use from a web app, a command line tool, or an AI chat assistant. Each user's tasks are private to them.

> Status: milestone 1 (a deployable skeleton with a health check).

## Features

- Tasks with a status (new, queued, in progress, paused, completed) and an optional due date or time
- A trash: deleted tasks can be restored, and permanent deletes always ask for confirmation
- The same tasks from the web app, the terminal, or an AI chat assistant
- A personal profile with a timezone, so due dates show correctly

## Run it locally

You need Node 26, pnpm and Docker.

```sh
nvm use                          # Node 26
npm i -g pnpm@10.34.9
pnpm install
docker compose up -d --wait      # the database, on port 5433
cp .env.example .env             # then fill in the values (see the comments inside)
pnpm --filter @todo/api migrate  # create the tables
pnpm --filter @todo/web build    # build the web app
pnpm --filter @todo/api dev      # start the API, which also serves the web app
```

Then open <http://localhost:8080>. Sign-in needs the sign-in values in `.env`, and `http://localhost:8080/auth/callback` and `http://localhost:8080/signed-out` registered with the sign-in provider. Rebuild the web app after changing it.

Tests and checks (the tests use the same database; override it with `TEST_DATABASE_URL`):

```sh
pnpm test
pnpm lint && pnpm typecheck
```

## Built with

TypeScript, Node.js, Express, Angular, PostgreSQL, and the Model Context Protocol.

## Rules for contributors (and AI agents)

See [`CLAUDE.md`](CLAUDE.md). The behaviour every test must prove is specified in [`docs/use-cases/`](docs/use-cases/).
