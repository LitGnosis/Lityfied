export async function sendEmail(to:string,subject:string,html:string,idempotencyKey?:string){
  const key=process.env.RESEND_API_KEY,from=process.env.EMAIL_FROM;
  if(!key||!from){console.warn('LITYFIED_EMAIL_NOT_CONFIGURED',subject);return {sent:false}}
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from,to:[to],subject,html}),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`Email delivery failed (${r.status})`);
  return {sent:true}
}
