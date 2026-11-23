import cloudHandler from '../cloud.js';
export default function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  req.query={...req.query,action:'jobs'};
  return cloudHandler(req,res);
}