import { neon } from '@neondatabase/serverless';

function databaseUrl() {
  const url = process.env.LG_DATABASE_URL;
  if (!url) throw new Error('LG_DATABASE_URL is not configured');
  return url;
}

export function db() {
  return neon(databaseUrl());
}
