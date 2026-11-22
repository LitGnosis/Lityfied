"""Lityfied Phase 4 Railway preview API. Fail-closed paid rendering."""
from __future__ import annotations
import base64,hashlib,hmac,io,json,os,re,secrets,time,uuid
from datetime import datetime,timezone
from decimal import Decimal
from urllib.parse import urlparse
from typing import Literal
from fastapi import FastAPI,HTTPException,Header,File,UploadFile,Form,Request
from fastapi.responses import RedirectResponse,JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel,Field
from psycopg.rows import dict_row
import httpx
from store import db,init_db,bucket,bucket_name,sanitize_image,put_image,presign,safe_key,exists,get_bytes
from provider import build,submit as provider_submit,poll as provider_poll,price_for
from budget import reserve,CAP,LIB_CAP,PROJECT_CAP

app=FastAPI(title='Lityfied Railway Phase 4 Continuity Preview',version='0.4.1',docs_url=None,redoc_url=None,openapi_url=None)
origins=[x.strip() for x in os.getenv('CORS_ORIGINS','').split(',') if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST'],allow_headers=['Authorization','Content-Type','X-Preview-Token'],allow_credentials=False)

@app.on_event('startup')
def startup():init_db()

def guard(req:Request):
    expected=os.getenv('PREVIEW_ACCESS_TOKEN','')
    token=req.headers.get('x-preview-token','')
    if not expected or not hmac.compare_digest(token,expected):raise HTTPException(401,'Preview access required')

def signing_key():
    key=os.environ.get('SESSION_SIGNING_KEY','')
    if len(key)<32:raise RuntimeError('Session signing secret not configured')
    return key.encode()

def sign(blob:bytes)->str:return hmac.new(signing_key(),blob,hashlib.sha256).hexdigest()

def issue_token(library_id)->str:
    data=json.dumps({'lid':str(library_id),'exp':int(time.time())+43200},separators=(',',':')).encode()
    encoded=base64.urlsafe_b64encode(data).rstrip(b'=').decode()
    return encoded+'.'+sign(encoded.encode())

def owner(req:Request):
    guard(req)
    token=req.headers.get('authorization','')
    if not token.startswith('Bearer '):raise HTTPException(401,'Recovery-key session required')
    try:
        encoded,sig=token[7:].split('.')
        if not hmac.compare_digest(sig,sign(encoded.encode())):raise ValueError()
        data=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))
        if int(data['exp'])<time.time():raise ValueError()
        return uuid.UUID(data['lid'])
    except Exception:raise HTTPException(401,'Invalid or expired recovery session')

def digest_key(raw):
    pepper=os.environ.get('RECOVERY_KEY_PEPPER','')
    if len(pepper)<32:raise RuntimeError('Recovery pepper missing')
    return hashlib.sha256((pepper+':'+raw).encode()).hexdigest()

def require_project(library,project):
    with db() as conn:
        row=conn.execute('SELECT id FROM projects WHERE id=%s AND library_id=%s',(str(project),str(library))).fetchone()
        if not row:raise HTTPException(403,'Project not owned by this recovery library')
    return str(project)

def require_scene(library,project,scene):
    require_project(library,project)
    with db() as conn:
        row=conn.execute('SELECT id,sequence_id,ordinal,prompt,locks,anchor_ids FROM scenes WHERE id=%s AND project_id=%s',(str(scene),str(project))).fetchone()
        if not row:raise HTTPException(404,'Scene not in project')
        return dict(zip(['id','sequence_id','ordinal','prompt','locks','anchor_ids'],row))

def fetch_anchors(library,project,ids):
    if len(ids)!=len(set(ids)) or len(ids)>12:raise HTTPException(422,'Invalid or duplicate anchor selection')
    if not ids:return []
    with db() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute('SELECT id,kind,object_key,label FROM anchors WHERE project_id=%s AND id=ANY(%s::uuid[])',(str(project),[str(x) for x in ids]))
            found=cur.fetchall()
    if len(found)!=len(ids):raise HTTPException(403,'Anchor outside this project')
    by_id={str(a['id']):a for a in found}
    return [by_id[str(i)] for i in ids]

@app.get('/health')
def health():
    return {'ok':True,'service':'Lityfied Phase4 Railway continuity preview','mode':'railway-only','paidRender':os.getenv('PROVIDER_SUBMISSIONS_ENABLED','false')=='true','previewProtected':True,'projectDailyCap':PROJECT_CAP,'libraryDailyCap':LIB_CAP,'dailyBudgetUsd':str(CAP),'providerReady':bool(os.getenv('ALIBABA_API_KEY')),'referenceModes':['character','start_frame','text']}

class RecoveryBody(BaseModel):key:str|None=None
@app.post('/v1/recovery/create')
def new_recovery(request:Request):
    guard(request)
    k='LITY-'+secrets.token_hex(32)
    lid=uuid.uuid4()
    with db() as conn:conn.execute('INSERT INTO libraries(id,recovery_digest) VALUES(%s,%s)',(lid,digest_key(k)))
    return {'ok':True,'recoveryKey':k,'sessionToken':issue_token(lid)}

@app.post('/v1/recovery/open')
def open_recovery(request:Request,b:RecoveryBody):
    guard(request)
    if not b.key or not re.fullmatch(r'LITY-[a-f0-9]{64}',b.key):raise HTTPException(401,'Invalid recovery key')
    with db() as conn:
        row=conn.execute('SELECT id FROM libraries WHERE recovery_digest=%s',(digest_key(b.key),)).fetchone()
    if not row:raise HTTPException(401,'Recovery key not found')
    return {'ok':True,'sessionToken':issue_token(row[0])}

class ProjectCreate(BaseModel):title:str=Field(min_length=1,max_length=100)
@app.post('/v1/projects/create')
def create_project(request:Request,b:ProjectCreate):
    lid=owner(request);pid=uuid.uuid4()
    with db() as conn:conn.execute('INSERT INTO projects(id,library_id,title) VALUES(%s,%s,%s)',(pid,lid,b.title))
    return {'ok':True,'projectId':str(pid),'title':b.title}

@app.get('/v1/projects')
def list_projects(request:Request):
    lid=owner(request)
    with db() as conn:
        rows=conn.execute('SELECT id,title FROM projects WHERE library_id=%s ORDER BY created_at DESC',(lid,)).fetchall()
    return {'ok':True,'projects':[{'id':str(i),'title':t} for i,t in rows]}

class SceneBody(BaseModel):
    projectId:uuid.UUID
    sceneId:uuid.UUID|None=None
    sequenceId:uuid.UUID
    ordinal:int=Field(ge=0,le=500)
    prompt:str=Field(min_length=5,max_length=1500)
    anchorIds:list[uuid.UUID]=Field(default_factory=list,max_length=12)
    locks:dict[str,bool]=Field(default_factory=dict)

@app.post('/v1/scenes/save')
def save_scene(request:Request,b:SceneBody):
    lid=owner(request);pid=require_project(lid,b.projectId)
    anchors=fetch_anchors(lid,pid,b.anchorIds)
    allowed={'lockCharacterIdentity','lockWardrobeProps','lockLightingPalette','lockCameraStyle','usePreviousSceneFrame'}
    if set(b.locks)-allowed:raise HTTPException(422,'Unknown continuity lock')
    sid=b.sceneId or uuid.uuid4()
    with db() as conn:
        # An id from another project cannot be upserted.
        prior=conn.execute('SELECT project_id FROM scenes WHERE id=%s',(sid,)).fetchone()
        if prior and str(prior[0])!=pid:raise HTTPException(403,'Scene owned by another project')
        conn.execute('INSERT INTO scenes(id,project_id,sequence_id,ordinal,prompt,locks,anchor_ids) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET ordinal=EXCLUDED.ordinal,prompt=EXCLUDED.prompt,locks=EXCLUDED.locks,anchor_ids=EXCLUDED.anchor_ids',(sid,pid,b.sequenceId,b.ordinal,b.prompt,json.dumps(b.locks),json.dumps([str(a['id']) for a in anchors])))
    return {'ok':True,'sceneId':str(sid)}

@app.get('/v1/scenes')
def scenes(request:Request,project_id:uuid.UUID):
    lid=owner(request);require_project(lid,project_id)
    with db() as conn:
        rows=conn.execute('SELECT id,sequence_id,ordinal,prompt,locks,anchor_ids FROM scenes WHERE project_id=%s ORDER BY sequence_id,ordinal',(project_id,)).fetchall()
    return {'ok':True,'scenes':[{'id':str(i),'sequenceId':str(q),'ordinal':n,'prompt':p,'locks':l,'anchorIds':a} for i,q,n,p,l,a in rows]}

@app.post('/v1/anchors/upload')
async def anchor_upload(request:Request,projectId:uuid.UUID=Form(...),kind:Literal['character','location','style']=Form(...),label:str=Form(...),file:UploadFile=File(...)):
    lid=owner(request);pid=require_project(lid,projectId)
    if not 1<=len(label)<=120:raise HTTPException(422,'Invalid anchor label')
    data=await file.read(10*1024*1024+1)
    try:clean,mime,digest=sanitize_image(data,file.content_type or '')
    except ValueError as e:raise HTTPException(422,str(e))
    aid=uuid.uuid4();key=safe_key(lid,pid,'anchors',aid,'jpg')
    put_image(key,clean,mime)
    with db() as conn:conn.execute('INSERT INTO anchors(id,project_id,kind,label,object_key,sha256,mime,bytes) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',(aid,pid,kind,label,key,digest,mime,len(clean)))
    return {'ok':True,'anchorId':str(aid),'type':kind,'sizeBytes':len(clean),'sha256':digest}

@app.get('/v1/anchors')
def list_anchors(request:Request,project_id:uuid.UUID):
    lid=owner(request);require_project(lid,project_id)
    with db() as conn:
        rows=conn.execute('SELECT id,kind,label,sha256 FROM anchors WHERE project_id=%s ORDER BY created_at',(project_id,)).fetchall()
    return {'ok':True,'anchors':[{'id':str(i),'kind':k,'label':l,'sha256':s} for i,k,l,s in rows]}

@app.get('/v1/anchors/{anchor_id}/preview')
def preview_anchor(request:Request,anchor_id:uuid.UUID):
    lid=owner(request)
    with db() as conn:
        r=conn.execute('SELECT a.object_key FROM anchors a JOIN projects p ON p.id=a.project_id WHERE a.id=%s AND p.library_id=%s',(anchor_id,lid)).fetchone()
    if not r:raise HTTPException(404,'Anchor not found')
    return RedirectResponse(presign(r[0],300),status_code=302,headers={'Cache-Control':'private,no-store'})

class AnchorFromScene(BaseModel):projectId:uuid.UUID;sceneId:uuid.UUID;label:str=Field(min_length=1,max_length=120);kind:Literal['character','location','style']='character'
@app.post('/v1/anchors/from-scene')
def anchor_from_scene(request:Request,b:AnchorFromScene):
    lid=owner(request);require_scene(lid,b.projectId,b.sceneId)
    with db() as conn:
        row=conn.execute("SELECT frame_key FROM render_jobs WHERE scene_id=%s AND library_id=%s AND status='completed' AND frame_key IS NOT NULL ORDER BY updated_at DESC LIMIT 1",(b.sceneId,lid)).fetchone()
    if not row:raise HTTPException(409,'Scene frame not ready')
    raw=get_bytes(row[0],10*1024*1024)
    clean,mime,digest=sanitize_image(raw,'image/png')
    aid=uuid.uuid4();key=safe_key(lid,b.projectId,'anchors',aid,'jpg')
    put_image(key,clean,mime)
    with db() as conn:conn.execute('INSERT INTO anchors(id,project_id,kind,label,object_key,sha256,mime,bytes) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',(aid,b.projectId,b.kind,b.label,key,digest,mime,len(clean)))
    return {'ok':True,'anchorId':str(aid),'sha256':digest}

def scene_spec(lid,pid,scene_id):
    scene=require_scene(lid,pid,scene_id)
    anchors=fetch_anchors(lid,pid,[uuid.UUID(x) for x in scene['anchor_ids']])
    locks=scene['locks'];char=[a for a in anchors if a['kind']=='character']
    previous=None
    if locks.get('usePreviousSceneFrame',False) and scene['ordinal']>0:
        with db() as conn:
            prev=conn.execute('SELECT id FROM scenes WHERE project_id=%s AND sequence_id=%s AND ordinal=%s',(pid,scene['sequence_id'],scene['ordinal']-1)).fetchone()
            if not prev:raise HTTPException(409,'Previous scene in sequence is missing')
            ready=conn.execute("SELECT frame_key FROM render_jobs WHERE scene_id=%s AND library_id=%s AND status='completed' AND frame_key IS NOT NULL ORDER BY updated_at DESC LIMIT 1",(prev[0],lid)).fetchone()
            if not ready:raise HTTPException(409,'Previous scene final frame is not yet ready')
            previous=presign(ready[0],600)
    if char and previous:raise HTTPException(422,'Current model cannot use both character references and previous frame simultaneously')
    char_urls=[presign(a['object_key'],600) for a in char]
    prompt=scene['prompt']
    notes=[]
    for k,text in [('lockCharacterIdentity','Preserve character identity.'),('lockWardrobeProps','Preserve wardrobe and props.'),('lockLightingPalette','Preserve lighting and color palette.'),('lockCameraStyle','Preserve camera style.')]:
        if locks.get(k,False):notes.append(text)
    if notes:prompt+='\nContinuity constraints: '+' '.join(notes)
    try:spec=build(prompt,5,char_urls,previous,sum(a['kind']=='location' for a in anchors),sum(a['kind']=='style' for a in anchors))
    except (ValueError,RuntimeError) as e:raise HTTPException(422,str(e))
    return spec,anchors,scene

class RenderBody(BaseModel):projectId:uuid.UUID;sceneId:uuid.UUID
@app.post('/v1/renders/prepare')
def render_prepare(request:Request,b:RenderBody):
    lid=owner(request);spec,anchors,scene=scene_spec(lid,b.projectId,b.sceneId)
    return {'ok':True,'mode':spec.mode,'model':spec.model,'estimatedUsd':str(spec.price),'providerReferenceCount':len(spec.payload['input'].get('reference_urls',[]))+(1 if 'img_url' in spec.payload['input'] else 0),'locationStyleAssetsPreservedButNotProviderVisualInputs':sum(a['kind'] in ('location','style') for a in anchors),'providerSubmissionsEnabled':os.getenv('PROVIDER_SUBMISSIONS_ENABLED','false')=='true'}

@app.post('/v1/renders/submit')
async def render_submit(request:Request,b:RenderBody):
    lid=owner(request)
    if os.getenv('PROVIDER_SUBMISSIONS_ENABLED','false')!='true':raise HTTPException(503,'Paid generation is disabled in this Railway preview')
    if not os.getenv('ALIBABA_API_KEY'):raise HTTPException(503,'No direct-provider API key connected')
    spec,anchors,scene=scene_spec(lid,b.projectId,b.sceneId)
    digest=hashlib.sha256((str(lid)+str(b.sceneId)+json.dumps(spec.payload,sort_keys=True)).encode()).hexdigest()
    try:record=reserve(lid,b.projectId,b.sceneId,digest,spec.price,spec.mode,spec.model)
    except ValueError as e:raise HTTPException(429,str(e))
    if record['deduplicated']:return {'ok':True,'renderJobId':record['id'],'state':record['status'],'deduplicated':True}
    with db() as conn:conn.execute("UPDATE render_jobs SET status='submitting',updated_at=now() WHERE id=%s",(record['id'],))
    try:task=await provider_submit(spec)
    except Exception as e:
        # The request may have reached the provider: reserve money until manually reconciled.
        with db() as conn:conn.execute("UPDATE render_jobs SET status='unknown',updated_at=now() WHERE id=%s",(record['id'],))
        raise HTTPException(502,'Provider submission not confirmed; quota remains reserved, no automatic retry') from e
    with db() as conn:conn.execute("UPDATE render_jobs SET status='submitted',task_id=%s,updated_at=now() WHERE id=%s",(task,record['id']))
    return {'ok':True,'renderJobId':record['id'],'state':'submitted','estimatedUsd':str(spec.price)}

async def ingest_video(url,key):
    parsed=urlparse(url)
    host=(parsed.hostname or '').lower()
    if parsed.scheme!='https' or not any(host==h or host.endswith('.'+h) for h in ('aliyuncs.com','alibabacloud.com','alibabausercontent.com')):raise ValueError('Provider media host not approved')
    async with httpx.AsyncClient(timeout=httpx.Timeout(15,read=100),follow_redirects=False) as client:
        async with client.stream('GET',url) as response:
            response.raise_for_status()
            if int(response.headers.get('content-length',0))>250*1024*1024:raise ValueError('Video too large')
            buf=bytearray()
            async for chunk in response.aiter_bytes(262144):
                buf.extend(chunk)
                if len(buf)>250*1024*1024:raise ValueError('Video exceeds limit')
    if len(buf)<3000 or buf[4:8]!=b'ftyp':raise ValueError('Unexpected provider video file')
    bucket().put_object(Bucket=bucket_name(),Key=key,Body=bytes(buf),ContentType='video/mp4')
    return len(buf)

@app.get('/v1/renders/{render_job_id}')
async def render_status(request:Request,render_job_id:uuid.UUID):
    lid=owner(request)
    with db() as conn:
        row=conn.execute('SELECT task_id,status,project_id,scene_id,media_key,frame_key FROM render_jobs WHERE id=%s AND library_id=%s',(render_job_id,lid)).fetchone()
    if not row:raise HTTPException(404,'Render job not found')
    task,status,pid,sid,media_key,frame_key=row
    if status not in ('submitted','running') or not task:return {'ok':True,'status':status,'frameReady':bool(frame_key),'mediaReady':bool(media_key)}
    try:result=await provider_poll(task)
    except Exception:return {'ok':True,'status':status,'warning':'Provider poll unavailable; retry later'}
    state=result.get('task_status','')
    if state in ('PENDING','RUNNING'):
        with db() as conn:conn.execute("UPDATE render_jobs SET status='running',updated_at=now() WHERE id=%s",(render_job_id,))
        return {'ok':True,'status':'running'}
    if state in ('FAILED','CANCELED'):
        with db() as conn:conn.execute("UPDATE render_jobs SET status='failed',updated_at=now() WHERE id=%s",(render_job_id,))
        return {'ok':True,'status':'failed'}
    if state!='SUCCEEDED':return {'ok':True,'status':status,'warning':'Provider returned unknown state'}
    video_url=result.get('video_url') or (result.get('results') or [{}])[0].get('url')
    if not video_url:return {'ok':True,'status':'running','warning':'Provider completed without media URL'}
    media_key=safe_key(lid,pid,'scenes',sid,'mp4')
    try:await ingest_video(video_url,media_key)
    except Exception:return {'ok':True,'status':'running','warning':'Media import pending'}
    with db() as conn:conn.execute("UPDATE render_jobs SET status='media_ready',media_key=%s,updated_at=now() WHERE id=%s",(media_key,render_job_id))
    # Scene-level final-frame extraction handled by dedicated Railway worker after import.
    frame_service=os.getenv('FRAME_WORKER_INTERNAL_URL','')
    secret=os.getenv('FRAME_WORKER_SECRET','')
    if frame_service and secret:
        payload={'libraryId':str(lid),'projectId':str(pid),'sceneId':str(sid),'mediaKey':media_key}
        raw=json.dumps(payload,separators=(',',':')).encode()
        signature=hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                rr=await client.post(frame_service.rstrip('/')+'/v1/frame',content=raw,headers={'content-type':'application/json','x-phase4-signature':signature})
                rr.raise_for_status();frame_key=rr.json().get('frameKey')
        except Exception:frame_key=None
    with db() as conn:conn.execute("UPDATE render_jobs SET status=%s,frame_key=%s,updated_at=now() WHERE id=%s",('completed' if frame_key else 'media_ready',frame_key,render_job_id))
    return {'ok':True,'status':'completed' if frame_key else 'media_ready','frameReady':bool(frame_key)}
