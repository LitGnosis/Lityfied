import 'server-only';
import postgres from 'postgres';

// LG_POSTGRES_URL is the configured production connection; retain LG_DATABASE_URL for local compatibility.
const connectionString = process.env.LG_DATABASE_URL ?? process.env.LG_POSTGRES_URL;

export const sql = connectionString
  ? postgres(connectionString, { ssl: 'require', max: 1, prepare: false })
  : null;
