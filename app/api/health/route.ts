import {NextResponse} from 'next/server';
import {RELEASE} from '../../../lib/launch';
import {ensureSchema} from '../../../lib/db';
export const dynamic='force-dynamic';
export async function GET(){
 let database=false;try{await ensureSchema();database=true}catch{}
 return NextResponse.json({ok:database,service:'lityfied',version:RELEASE,database,time:new Date().toISOString()},{status:database?200:503,headers:{'Cache-Control':'no-store'}});
}
