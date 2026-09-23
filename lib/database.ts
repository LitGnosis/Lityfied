import { neon } from '@neondatabase/serverless';

function databaseUrl() {
  const url = process.env.LG_DATABASE_URL ?? process.env.LG_POSTGRES_URL;
  if (!url) throw new Error('LG_POSTGRES_URL is not configured');
  return url;
}

export function db() {
  return neon(databaseUrl());
}
