import pg from 'pg';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL missing; migration was not run.');
const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:10000});
const client=await pool.connect();
try {
 await client.query('begin');
 await client.query("select pg_advisory_xact_lock(hashtext('lityfied-migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text primary key,applied_at timestamptz default now())');
 const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
  if((await client.query('select 1 from schema_migrations where version=$1',[file])).rowCount)continue;
  await client.query(await readFile(`${dir}/${file}`,'utf8'));
  await client.query('insert into schema_migrations(version) values($1)',[file]);
  console.log(`Applied ${file}`);
 }
 await client.query('commit');
 console.log('Migration complete.');
}catch(e){await client.query('rollback');throw e}finally{client.release();await pool.end()}
