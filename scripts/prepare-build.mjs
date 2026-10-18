import {spawnSync} from 'node:child_process';
// Production uses its managed database credentials without exporting them.
// These additive migrations are transactional, locked, and repeatable.
if (process.env.VERCEL_ENV === 'production') {
 for (const script of ['scripts/migrate.mjs', 'scripts/verify-database.mjs']) {
  const result = spawnSync(process.execPath, [script], {stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
 }
}
