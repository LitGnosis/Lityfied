import cloudHandler from '../cloud.js';
export default function handler(req,res) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!req.body||req.body.authorized!==true||req.body.suite!=='android_settings_smoke')return res.status(400).json({error:'Authorized Android QA smoke-test request required'});
  if('userId' in req.body||'recipeUuid' in req.body)return res.status(400).json({error:'User identity and recipe are assigned by the server; do not send userId or recipeUuid'});
  req.query={...req.query,action:'run'};
  return cloudHandler(req,res);
}