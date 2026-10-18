import {NextRequest,NextResponse} from 'next/server';
import {put} from '@vercel/blob';
import {randomUUID} from 'crypto';
import {currentUser} from '../../../../lib/auth';
import {sameOrigin} from '../../../../lib/security';
import {rateLimit,clientKey} from '../../../../lib/rate-limit';

const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']);
export async function POST(r:NextRequest){
 if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
 if(!await rateLimit(`review-media:${clientKey(r)}`,12,60*60*1000))return NextResponse.json({error:'Too many uploads. Please try again later.'},{status:429});
 const u=await currentUser();if(!u)return NextResponse.json({error:'Sign in to upload review media.'},{status:401});
 try{
  const form=await r.formData();const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'Choose a file to upload.'},{status:400});
  if(!allowed.has(file.type))return NextResponse.json({error:'Use JPG, PNG, WebP, GIF, MP4 or WebM.'},{status:400});
  if(file.size<1||file.size>4*1024*1024)return NextResponse.json({error:'Review media must be 4 MB or smaller.'},{status:400});
  const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,8)||'bin';
  const blob=await put(`reviews/${u.id}/${randomUUID()}.${ext}`,file,{access:'public',addRandomSuffix:false});
  return NextResponse.json({ok:true,url:blob.url,contentType:file.type,size:file.size});
 }catch(e:any){return NextResponse.json({error:e?.message||'Review media upload is unavailable.'},{status:503})}
}
