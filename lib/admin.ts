import {NextRequest} from 'next/server';import {timingSafeEqual} from 'crypto';
type Role='owner'|'operations'|'support'|'marketing';
function same(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);if(!left.length||left.length!==right.length)return false;return timingSafeEqual(left,right)}
export function adminRole(req:NextRequest):Role|null{const got=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';const pairs:[Role,string|undefined][]=[['owner',process.env.ADMIN_OWNER_SECRET||process.env.ADMIN_SECRET],['operations',process.env.ADMIN_OPERATIONS_SECRET],['support',process.env.ADMIN_SUPPORT_SECRET],['marketing',process.env.ADMIN_MARKETING_SECRET]];for(const [role,secret] of pairs)if(secret&&same(got,secret))return role;return null}
export function isAdmin(req:NextRequest){return adminRole(req)!==null}
export function roleAllows(role:Role|null,allowed:Role[]){return Boolean(role&&allowed.includes(role))}
