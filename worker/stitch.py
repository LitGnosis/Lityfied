"""Durable, checkpointed FFmpeg scene stitching for trusted local worker media."""
import argparse,hashlib,json,math,pathlib,subprocess
def run(cmd):
    p=subprocess.run(cmd,capture_output=True,text=True)
    if p.returncode:raise RuntimeError("FFmpeg failed: "+p.stderr[-1600:])
    return p.stdout
def probe(path):
    d=json.loads(run(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(path)]))
    v=[s for s in d.get("streams",[]) if s.get("codec_type")=="video"]
    if not v:raise ValueError("Video stream missing")
    return float(d["format"].get("duration",0))
def local(v,root):
    p=pathlib.Path(v).resolve()
    if not p.is_relative_to(root) or not p.is_file():raise ValueError("Media path not trusted")
    return p
def concat(paths,out):
    lst=out.with_suffix(".ffconcat")
    lst.write_text("ffconcat version 1.0\n"+"".join("file '"+str(p).replace("'","'\\''")+"'\n" for p in paths))
    tmp=out.with_suffix(".tmp.mp4")
    run(["ffmpeg","-y","-hide_banner","-loglevel","error","-safe","0","-f","concat","-i",str(lst),"-map","0:v:0","-c:v","copy","-an","-movflags","+faststart",str(tmp)])
    tmp.replace(out)
def stitch(manifest,media_root,out_dir,width,height,fps=24,preset="veryfast",crf=22,reel_sec=120,dry_run=False):
    clips=manifest.get("clips",[])
    if not 1<=len(clips)<=1500 or not 24<=fps<=60 or width%2 or height%2 or not 320<=width<=3840 or not 180<=height<=2160:raise ValueError("Invalid timeline parameters")
    root=pathlib.Path(media_root).resolve();out=pathlib.Path(out_dir).resolve()
    norm=out/"normalized";reeldir=out/"reels";norm.mkdir(parents=True,exist_ok=True);reeldir.mkdir(parents=True,exist_ok=True)
    totalframes=0;groups=[];group=[];groupframes=0
    for i,item in enumerate(clips):
        p=local(item["path"],root);frames=round(float(item["durationSeconds"])*fps)
        if not 1<=frames<=600*fps:raise ValueError("Invalid scene length")
        observed=probe(p)
        if abs(observed-frames/fps)>max(0.5,2/fps):raise ValueError("Scene duration mismatch")
        totalframes+=frames
        if totalframes>7200*fps:raise ValueError("Film exceeds 120 minutes")
        key=hashlib.sha256(p.read_bytes()).hexdigest()[:18] if p.stat().st_size<100_000_000 else hashlib.sha256((str(p)+str(p.stat().st_size)+str(p.stat().st_mtime_ns)).encode()).hexdigest()[:18]
        normalized=norm/f"{i:05d}_{key}_{frames}_{width}x{height}_{fps}_{crf}.mp4"
        if not normalized.exists() and not dry_run:
            temp=normalized.with_suffix(".tmp.mp4")
            vf=f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
            run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(p),"-vf",vf,"-frames:v",str(frames),"-an","-c:v","libx264","-preset",preset,"-crf",str(crf),"-pix_fmt","yuv420p","-video_track_timescale",str(fps*1000),str(temp)])
            temp.replace(normalized)
        group.append(normalized);groupframes+=frames
        if groupframes>=reel_sec*fps:groups.append(group);group=[];groupframes=0
    if group:groups.append(group)
    total=totalframes/fps
    if dry_run:return {"clips":len(clips),"reels":len(groups),"durationSeconds":total}
    reels=[]
    for i,part in enumerate(groups):
        reel=reeldir/f"{i:04d}.mp4"
        if not reel.exists():concat(part,reel)
        reels.append(reel)
    silent=out/"picture_only.mp4"
    if not silent.exists():concat(reels,silent)
    stems=manifest.get("stems",[])
    if not isinstance(stems,list) or len(stems)>30:raise ValueError("Invalid number of audio stems")
    cmd=["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(silent)]
    filters=[]
    for i,stem in enumerate(stems):
        path=local(stem["path"],root);gain=float(stem.get("gain",1));offset=float(stem.get("offsetSeconds",0))
        if not math.isfinite(gain) or not 0<=gain<=4 or not math.isfinite(offset) or not 0<=offset<=total:raise ValueError("Audio gain/offset invalid")
        cmd+=["-i",str(path)]
        ms=round(offset*1000)
        filters.append(f"[{i+1}:a:0]aresample=48000:async=1:first_pts=0,volume={gain},adelay={ms}|{ms},atrim=0:{total:.6f},asetpts=N/SR/TB[a{i}]")
    if stems:
        filters.append("".join(f"[a{i}]" for i in range(len(stems)))+f"amix=inputs={len(stems)}:duration=longest:dropout_transition=0,alimiter=limit=0.95[outa]")
        cmd+=["-filter_complex",";".join(filters),"-map","0:v:0","-map","[outa]"]
    else:
        cmd+=["-f","lavfi","-t",str(total),"-i","anullsrc=r=48000:cl=stereo","-map","0:v:0","-map","1:a:0"]
    final=out/("master_4k.mp4" if width==3840 and height==2160 else "master_preview.mp4")
    temp=out/"master_in_progress.mp4"
    cmd+=["-c:v","copy","-c:a","aac","-ar","48000","-ac","2","-b:a","256k","-t",str(total),"-movflags","+faststart",str(temp)]
    run(cmd);temp.replace(final)
    actual=probe(final)
    if abs(actual-total)>max(.15,2/fps):raise RuntimeError("Final duration mismatch")
    (out/"completed.json").write_text(json.dumps({"file":str(final),"durationSeconds":actual,"width":width,"height":height,"fps":fps,"clips":len(clips),"reels":len(reels)}))
    return str(final)
def main():
    p=argparse.ArgumentParser();p.add_argument("manifest",type=pathlib.Path);p.add_argument("--media-root",required=True);p.add_argument("--out",required=True)
    p.add_argument("--width",type=int,default=3840);p.add_argument("--height",type=int,default=2160);p.add_argument("--fps",type=int,default=24);p.add_argument("--reel-seconds",type=int,default=120);p.add_argument("--preset",default="veryfast");p.add_argument("--crf",type=int,default=22);p.add_argument("--dry-run",action="store_true")
    x=p.parse_args()
    stitch(json.loads(x.manifest.read_text()),x.media_root,x.out,x.width,x.height,x.fps,x.preset,x.crf,x.reel_seconds,x.dry_run)
if __name__=="__main__":main()
