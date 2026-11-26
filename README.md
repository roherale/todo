# todo

A personal task list you can use from a web app, a command line tool, or an AI chat assistant. Each user's tasks are private to them.

> Status: milestone 1 (a deployable skeleton with a health check).

## Features

- Tasks with a status (new, queued, in progress, paused, completed) and an optional due date or time
- A trash: deleted tasks can be restored, and permanent deletes always ask for confirmation
- The same tasks from the web app, the terminal, or an AI chat assistant
- A personal profile with a timezone, so due dates show correctly

## Run it locally

```sh
nvm use                 # Node 26
npm i -g pnpm@10.34.9
pnpm install
cp .env.example .env    # then edit
docker run -d --rm --name todo-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:17
pnpm test               # needs the database above (override with TEST_DATABASE_URL)
pnpm lint && pnpm typecheck
```

## Built with

TypeScript, Node.js, Express, Angular, PostgreSQL, and the Model Context Protocol.

## Rules for contributors (and AI agents)

See [`CLAUDE.md`](CLAUDE.md). The behaviour every test must prove is specified in [`docs/use-cases/`](docs/use-cases/).
