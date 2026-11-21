"""Lityfied isolated FFmpeg queue and HMAC-authenticated assembly service."""
from __future__ import annotations
import hashlib, hmac, ipaddress, json, os, shutil, socket, sqlite3, threading, time
from pathlib import Path
from urllib.parse import urlparse
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
ROOT = Path(os.getenv("LITYFIED_DATA_DIR", "/data")).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
DB_PATH = ROOT / "queue.sqlite"
SECRET = os.getenv("LITYFIED_WORKER_SECRET", "")
CALLBACK_URL = os.getenv("LITYFIED_CALLBACK_URL", "")
CALLBACK_SECRET = os.getenv("LITYFIED_CALLBACK_SECRET", "")
HOSTS = [h.strip().lower() for h in os.getenv("LITYFIED_ALLOWED_MEDIA_HOSTS","blob.vercel-storage.com").split(",") if h.strip()]
if len(SECRET) < 32:
    raise RuntimeError("LITYFIED_WORKER_SECRET must have at least 32 characters")
def connect():
    db=sqlite3.connect(DB_PATH,timeout=30); db.row_factory=sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL");db.execute("PRAGMA busy_timeout=30000")
    return db
def init_db():
    with connect() as db:
        db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, manifest TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, attempts INTEGER DEFAULT 0, updated REAL NOT NULL)")
        db.execute("UPDATE jobs SET status='queued' WHERE status IN ('downloading','stitching')")
def signature(secret,data):
    return hmac.new(secret.encode("utf8"),data,hashlib.sha256).hexdigest()
def auth(req,payload):
    sig=req.headers.get("x-lityfied-signature","").removeprefix("sha256=")
    if not sig or not hmac.compare_digest(sig,signature(SECRET,payload)):
        raise HTTPException(401,"Invalid worker signature")
def allowed_media(url):
    try:
        x=urlparse(url)
        if x.scheme!="https" or x.username or x.password or not x.hostname:
            return False
        host=x.hostname.lower()
        if not any(host==h or host.endswith("."+h) for h in HOSTS):return False
        addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
        return bool(addresses) and all(ipaddress.ip_address(a[4][0]).is_global for a in addresses)
    except Exception:return False
def check_job(d):
    jid=d.get("jobId","")
    if not isinstance(jid,str) or len(jid)<8 or len(jid)>100 or not all(c.isalnum() or c in "-_" for c in jid):raise ValueError("Invalid job ID")
    clips=d.get("clips",[])
    if not isinstance(clips,list) or not 1<=len(clips)<=1500:raise ValueError("1..1500 clips required")
    for c in clips:
        if not isinstance(c,dict) or not allowed_media(c.get("url","")) or not 0<float(c.get("durationSeconds",0))<=600:
            raise ValueError("Bad clip URL or duration")
    stems=d.get("stems",[])
    if not isinstance(stems,list) or len(stems)>30:raise ValueError("Invalid stems")
    for s in stems:
        if not isinstance(s,dict) or not allowed_media(s.get("url","")):raise ValueError("Invalid audio URL")
    if sum(float(c["durationSeconds"]) for c in clips)>7200:raise ValueError("120-minute maximum")
    if d.get("resolution") not in ("hd","4k"):raise ValueError("Resolution must be hd or 4k")
    return jid
def download(url,path):
    if not allowed_media(url):raise ValueError("Media URL rejected")
    if path.exists() and path.stat().st_size>0:return
    tmp=path.with_suffix(".partial")
    with httpx.Client(timeout=httpx.Timeout(30,read=300),follow_redirects=False) as client:
        with client.stream("GET",url) as response:
            response.raise_for_status()
            if response.status_code in (301,302,303,307,308):raise ValueError("Redirect refused")
            total=0
            with tmp.open("wb") as f:
                for chunk in response.iter_bytes(262144):
                    total+=len(chunk)
                    if total>2*1024**3:raise ValueError("Media exceeds 2 GiB")
                    f.write(chunk)
    tmp.replace(path)
def update(jid,status,result=None,error=None):
    with connect() as db:
        db.execute("UPDATE jobs SET status=?,result=COALESCE(?,result),error=?,updated=? WHERE id=?",(status,result,error,time.time(),jid))
def callback(jid,status,result=None,error=None):
    if not CALLBACK_URL or not CALLBACK_SECRET:return
    payload=json.dumps({"jobId":jid,"status":status,"result":result,"error":error},separators=(",",":")).encode()
    try:
        with httpx.Client(timeout=15) as c:
            c.post(CALLBACK_URL,content=payload,headers={"Content-Type":"application/json","X-Lityfied-Signature":"sha256="+signature(CALLBACK_SECRET,payload)}).raise_for_status()
    except Exception as e:print("Callback deferred:",str(e)[:120],flush=True)
def process_job(jid,data):
    from .stitch import stitch
    home=(ROOT/"jobs"/jid).resolve()
    if not home.is_relative_to(ROOT):raise RuntimeError("Invalid output path")
    media=home/"media";out=home/"export";media.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    norm={"clips":[],"stems":[]}
    update(jid,"downloading")
    for i,clip in enumerate(data["clips"]):
        path=media/f"clip-{i:04d}.mp4";download(clip["url"],path)
        norm["clips"].append({"path":str(path),"durationSeconds":clip["durationSeconds"]})
    for i,stem in enumerate(data.get("stems",[])):
        path=media/f"stem-{i:02d}.wav";download(stem["url"],path)
        norm["stems"].append({"path":str(path),"gain":stem.get("gain",1),"offsetSeconds":stem.get("offsetSeconds",0)})
    (home/"job.json").write_text(json.dumps(norm))
    update(jid,"stitching");callback(jid,"stitching")
    w,h=(3840,2160) if data["resolution"]=="4k" else (1280,720)
    stitch(norm,media,out,w,h,24,"veryfast",22,120,dry_run=False)
    target=out/("master_4k.mp4" if w==3840 else "master_preview.mp4")
    if not target.exists() or not target.stat().st_size:raise RuntimeError("Export missing")
    result={"durationSeconds":sum(float(c["durationSeconds"]) for c in data["clips"]),"resolution":data["resolution"],"bytes":target.stat().st_size}
    update(jid,"ready",json.dumps(result));callback(jid,"ready",result)
def work_loop():
    while True:
        try:
            with connect() as db:
                row=db.execute("SELECT id,manifest FROM jobs WHERE status='queued' ORDER BY updated LIMIT 1").fetchone()
                if row:db.execute("UPDATE jobs SET status='downloading',attempts=attempts+1,updated=? WHERE id=?",(time.time(),row["id"]))
            if not row:time.sleep(3);continue
            try:process_job(row["id"],json.loads(row["manifest"]))
            except Exception as e:
                msg=str(e)[:300];update(row["id"],"failed",error=msg);callback(row["id"],"failed",error=msg)
                print("Job failed:",row["id"],msg,flush=True)
        except Exception as e:print("Queue error:",str(e)[:200],flush=True);time.sleep(5)
@asynccontextmanager
async def lifespan(app:FastAPI):
    init_db();threading.Thread(target=work_loop,daemon=True,name="ffmpeg-worker").start();yield
app=FastAPI(title="Lityfied Phase 3 FFmpeg",lifespan=lifespan)
@app.get("/health")
def health():
    return {"ok":True,"service":"Lityfied FFmpeg Worker","ffmpeg":shutil.which("ffmpeg") is not None,"queue":"sqlite-persistent","maxMinutes":120}
@app.post("/jobs",status_code=202)
async def submit(req:Request):
    raw=await req.body()
    if len(raw)>250000:raise HTTPException(413,"Manifest too large")
    auth(req,raw)
    try:
        data=json.loads(raw);jid=check_job(data)
    except Exception as e:raise HTTPException(422,str(e))
    with connect() as db:
        old=db.execute("SELECT status FROM jobs WHERE id=?",(jid,)).fetchone()
        if not old:db.execute("INSERT INTO jobs(id,manifest,status,updated) VALUES (?,?,?,?)",(jid,json.dumps(data),"queued",time.time()))
    return {"ok":True,"jobId":jid,"state":old["status"] if old else "queued"}
@app.get("/jobs/{job_id}")
def status(job_id:str,req:Request):
    if not hmac.compare_digest(req.headers.get("authorization",""),"Bearer "+SECRET):raise HTTPException(401)
    with connect() as db:row=db.execute("SELECT id,status,result,error,attempts FROM jobs WHERE id=?",(job_id,)).fetchone()
    if not row:raise HTTPException(404)
    return {"jobId":row["id"],"state":row["status"],"result":json.loads(row["result"]) if row["result"] else None,"error":row["error"],"attempts":row["attempts"]}
@app.get("/jobs/{job_id}/download")
def file(job_id:str,req:Request):
    if not hmac.compare_digest(req.headers.get("authorization",""),"Bearer "+SECRET):raise HTTPException(401)
    with connect() as db:row=db.execute("SELECT status,manifest FROM jobs WHERE id=?",(job_id,)).fetchone()
    if not row or row["status"]!="ready":raise HTTPException(404)
    data=json.loads(row["manifest"]);name="master_4k.mp4" if data["resolution"]=="4k" else "master_preview.mp4"
    path=(ROOT/"jobs"/job_id/"export"/name).resolve()
    if not path.is_relative_to(ROOT) or not path.exists():raise HTTPException(404)
    return FileResponse(path,media_type="video/mp4",filename=name)
