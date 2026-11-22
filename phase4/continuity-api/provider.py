"""Wan 2.6 legacy async adapter; fail closed for unsupported reference combinations."""
from __future__ import annotations
import os, re, httpx
from decimal import Decimal
from dataclasses import dataclass

MODELS={'text':'wan2.6-t2v','character':'wan2.6-r2v-flash','start_frame':'wan2.6-i2v-flash'}
RATES={'text':'AI_RATE_TEXT_USD_PER_SECOND','character':'AI_RATE_CHARACTER_USD_PER_SECOND','start_frame':'AI_RATE_FRAME_USD_PER_SECOND'}
ALLOWED_REGIONS=('ap-southeast-1','us-east-1','eu-central-1','cn-beijing')

@dataclass
class ProviderSpec:
    mode:str
    model:str
    payload:dict
    price:Decimal

def api_base():
    """Workspace-specific endpoint; never accept a client-supplied URL."""
    workspace=os.getenv('ALIBABA_WORKSPACE_ID','')
    region=os.getenv('ALIBABA_REGION','')
    if not re.fullmatch(r'[a-zA-Z0-9-]{6,80}',workspace) or region not in ALLOWED_REGIONS:
        raise RuntimeError('Provider workspace/region configuration missing')
    return f'https://{workspace}.{region}.maas.aliyuncs.com/api/v1'

def price_for(mode:str,duration:int)->Decimal:
    value=os.getenv(RATES[mode], '')
    if not value:
        if os.getenv('PROVIDER_SUBMISSIONS_ENABLED','false') != 'true': return Decimal('0')
        raise RuntimeError('Provider rate not verified; rendering is disabled')
    unit=Decimal(value)
    if unit<=0 or unit>=Decimal('10'):raise RuntimeError('Invalid provider rate')
    return (unit*Decimal(duration)).quantize(Decimal('0.000001'))

def build(prompt:str,duration:int,character_urls:list[str],start_frame_url:str|None,location_count=0,style_count=0)->ProviderSpec:
    if character_urls and start_frame_url:
        raise ValueError('Wan 2.6 cannot combine character reference and a starting frame in one generation request; choose one mode')
    if len(character_urls)>5:raise ValueError('At most five single-subject character references')
    if character_urls:
        mode='character'
        body={'model':MODELS[mode],'input':{'prompt':('character1 '+prompt)[:1500],'reference_urls':character_urls},'parameters':{'size':'1280*720','duration':duration,'audio':False,'shot_type':'single','watermark':False}}
    elif start_frame_url:
        mode='start_frame'
        body={'model':MODELS[mode],'input':{'prompt':prompt[:1500],'img_url':start_frame_url},'parameters':{'resolution':'720P','duration':duration,'audio':False,'watermark':False}}
    else:
        mode='text'
        body={'model':MODELS[mode],'input':{'prompt':prompt[:1500]},'parameters':{'size':'1280*720','duration':duration,'shot_type':'single','watermark':False}}
    # Wan 2.6 R2V only supports single-subject character images; location/style assets are
    # retained in the project but are NOT misrepresented as provider visual inputs.
    return ProviderSpec(mode,MODELS[mode],body,price_for(mode,duration))

async def submit(spec:ProviderSpec):
    if os.getenv('PROVIDER_SUBMISSIONS_ENABLED','false').lower()!='true':raise RuntimeError('Paid provider submission disabled on preview')
    key=os.getenv('ALIBABA_API_KEY','')
    if not key:raise RuntimeError('Alibaba API key not configured')
    url=api_base()+'/services/aigc/video-generation/video-synthesis'
    async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
        r=await client.post(url,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=spec.payload)
        r.raise_for_status()
        body=r.json()
        task=body.get('output',{}).get('task_id')
        if not task:raise RuntimeError('Provider accepted request without task id')
        return task

async def poll(task_id:str):
    key=os.getenv('ALIBABA_API_KEY','')
    if not key:raise RuntimeError('Alibaba API key missing')
    if not re.fullmatch('[A-Za-z0-9-]{8,128}',task_id):raise ValueError('Invalid task id')
    async with httpx.AsyncClient(timeout=20,follow_redirects=False) as client:
        r=await client.get(api_base()+'/tasks/'+task_id,headers={'Authorization':'Bearer '+key})
        r.raise_for_status()
        return r.json().get('output',{})
