import {Pool, type PoolClient, type QueryResultRow} from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
let pool:Pool|undefined;
const context=new AsyncLocalStorage<PoolClient>();
export function db(){
 const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL missing');
 return pool||(pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:10000,statement_timeout:15000}));
}
export async function query<T extends QueryResultRow=any>(text:string,params:any[]=[]){
 return (await (context.getStore()||db()).query<T>(text,params)).rows;
}
export async function transaction<T>(work:()=>Promise<T>):Promise<T>{
 if(context.getStore())return work();
 const client=await db().connect();
 try{await client.query('begin');const result=await context.run(client,work);await client.query('commit');return result}
 catch(e){await client.query('rollback');throw e}finally{client.release()}
}
export const SCHEMA_VERSION='002_launch_safety.sql';
export async function ensureSchema(){
 const rows=await query('select 1 from schema_migrations where version=$1',[SCHEMA_VERSION]);
 if(!rows.length)throw new Error('Database migration required. Run npm run db:migrate.');
}
export const ensurePlatinumSchema=ensureSchema;
