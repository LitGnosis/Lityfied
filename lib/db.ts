import 'server-only';
import postgres from 'postgres';

const connectionString = process.env.LG_DATABASE_URL;

export const sql = connectionString
  ? postgres(connectionString, { ssl: 'require', max: 1, prepare: false })
  : null;
