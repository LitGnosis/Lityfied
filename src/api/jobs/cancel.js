import cloudHandler from '../cloud.js';
export default function handler(req,res) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  req.query={...req.query,action:'cancel'};
  return cloudHandler(req,res);
}