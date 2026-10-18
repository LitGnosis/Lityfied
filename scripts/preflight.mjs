import fs from 'node:fs';
import path from 'node:path';
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())walk(name);else if(/\.(ts|tsx|mjs)$/.test(name))files.push(name)}}
walk('app');walk('lib');walk('scripts');
const errors=[];
for(const file of files){
 const source=fs.readFileSync(file,'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const target=path.resolve(path.dirname(file),match[1]);
  if(!['','.ts','.tsx','.mjs','.js','/index.ts','/index.tsx'].some(ext=>fs.existsSync(target+ext)))errors.push(`${file}: missing ${match[1]}`);
 }
}
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
for(const cron of config.crons||[])if(!fs.existsSync(`app${cron.path}/route.ts`))errors.push(`Missing cron route ${cron.path}`);
for(const file of ['package-lock.json','migrations/001_5.2.0.sql','migrations/002_launch_safety.sql'])if(!fs.existsSync(file))errors.push(`Missing ${file}`);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Source preflight passed (${files.length} files). This checks imports and files; it is not a production or lifecycle test.`);
