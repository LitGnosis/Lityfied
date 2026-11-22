"""Railway-only FFmpeg scene-final-frame extractor. Separate from production assembly worker."""
from __future__ import annotations
import hashlib,hmac,json,os,re,subprocess,tempfile,uuid
from pathlib import Path
import boto3
from fastapi import FastAPI,HTTPException,Request
from botocore.config import Config
app=FastAPI(title='Lityfied Scene Frame Worker',docs_url=None,redoc_url=None,openapi_url=None)
UUID=r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'


def s3():
    return boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT_URL'],region_name=os.getenv('S3_REGION','auto'),aws_access_key_id=os.environ['S3_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['S3_SECRET_ACCESS_KEY'],config=Config(s3={'addressing_style':os.getenv('S3_URL_STYLE','virtual')}))

def extract_frame(path:Path,target:Path):
    # Extract the last decodable frame from the actual scene MP4; never from a stitched master.
    args=['ffmpeg','-y','-nostdin','-hide_banner','-loglevel','error','-sseof','-0.15','-i',str(path),'-frames:v','1','-update','1',str(target)]
    proc=subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=90)
    if proc.returncode or not target.exists() or target.stat().st_size<100:
        raise RuntimeError('Failed to extract final scene frame: '+proc.stderr.decode(errors='replace')[-100:])
    return target.read_bytes()

@app.get('/health')
def health():return {'ok':True,'service':'Lityfied Railway scene-frame worker','ffmpeg':True,'productionAssemblyUnaffected':True}

@app.post('/v1/frame')
async def final_frame(req:Request):
    raw=await req.body()
    if len(raw)>3000:raise HTTPException(413,'Too large')
    secret=os.getenv('FRAME_WORKER_SECRET','')
    expected=hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest() if len(secret)>=32 else ''
    sig=req.headers.get('x-phase4-signature','')
    if not expected or not hmac.compare_digest(sig,expected):raise HTTPException(401,'Invalid job signature')
    try:
        p=json.loads(raw)
        owner,project,scene=(p[k] for k in ['libraryId','projectId','sceneId'])
        if not all(re.fullmatch(UUID,x) for x in (owner,project,scene)):raise ValueError()
        key=f'continuity/{owner}/{project}/scenes/{scene}.mp4'
        if key!=p.get('mediaKey'):raise ValueError()
    except Exception:raise HTTPException(422,'Invalid scene identity or media key')
    dst=f'continuity/{owner}/{project}/frames/{scene}.png'
    storage=s3();bucket=os.environ['S3_BUCKET']
    head=storage.head_object(Bucket=bucket,Key=key)
    if head['ContentLength']>250*1024*1024:raise HTTPException(413,'Scene media too large')
    with tempfile.TemporaryDirectory(prefix='lity-scene-') as tmp:
        input_path=Path(tmp)/'scene.mp4';frame_path=Path(tmp)/'last.png'
        with input_path.open('wb') as f:storage.download_fileobj(bucket,key,f)
        data=extract_frame(input_path,frame_path)
    storage.put_object(Bucket=bucket,Key=dst,Body=data,ContentType='image/png',CacheControl='private, max-age=0')
    return {'ok':True,'frameKey':dst,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
