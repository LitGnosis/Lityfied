import { neon } from '@neondatabase/serverless';
export function db(){const url=process.env.LG_DATABASE_URL;if(!url)throw new Error('LG_DATABASE_URL is not configured');return neon(url);}
