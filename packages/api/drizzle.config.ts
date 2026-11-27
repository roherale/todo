import { defineConfig } from 'drizzle-kit';

// `generate` only reads the schema, but `migrate` needs a database: fail with a clear message
// instead of the tool's generic "connection url or host required".
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl && process.argv.includes('migrate')) {
  throw new Error('DATABASE_URL is not set: it must be the address of the database to migrate');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/*.table.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl ?? '' },
});
