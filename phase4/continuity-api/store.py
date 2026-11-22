"""Railway-only persistence; all owner-scoped reads use library_id."""
from __future__ import annotations
import io, os, hashlib, uuid
from decimal import Decimal
from pathlib import Path
from contextlib import contextmanager
import psycopg
import boto3
from PIL import Image, ImageOps, UnidentifiedImageError
from botocore.config import Config

MAX_IMAGE_BYTES=10*1024*1024
Image.MAX_IMAGE_PIXELS=35_000_000

@contextmanager
def db():
    with psycopg.connect(os.environ['DATABASE_URL'],connect_timeout=5) as conn:
        yield conn

def init_db():
    with db() as conn:
        conn.execute(Path(__file__).with_name('schema.sql').read_text())

def bucket():
    cfg=Config(s3={'addressing_style':os.getenv('S3_URL_STYLE','virtual')})
    return boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT_URL'],region_name=os.getenv('S3_REGION','auto'),aws_access_key_id=os.environ['S3_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['S3_SECRET_ACCESS_KEY'],config=cfg)

def bucket_name():return os.environ['S3_BUCKET']

def safe_key(library_id,project_id,category,item_id,suffix):
    return f"continuity/{library_id}/{project_id}/{category}/{item_id}.{suffix}"

def sanitize_image(raw:bytes, claimed_mime:str):
    if not 100<=len(raw)<=MAX_IMAGE_BYTES:raise ValueError('Image must be 100 bytes to 10 MB')
    if claimed_mime not in ('image/png','image/jpeg','image/webp'):raise ValueError('Unsupported image content type')
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im.verify()
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ('PNG','JPEG','WEBP'):raise ValueError('Unsupported image format')
            im=ImageOps.exif_transpose(im)
            if im.width<128 or im.height<128 or im.width>8192 or im.height>8192:raise ValueError('Reference image size must be 128–8192 px')
            im=im.convert('RGB')
            im.thumbnail((2048,2048))
            o=io.BytesIO();im.save(o,format='JPEG',quality=92,optimize=True)
            clean=o.getvalue()
    except (UnidentifiedImageError,Image.DecompressionBombError,OSError) as e:
        raise ValueError('Invalid image content') from e
    if len(clean)>MAX_IMAGE_BYTES:raise ValueError('Sanitized image exceeds 10 MB')
    return clean,'image/jpeg',hashlib.sha256(clean).hexdigest()

def put_image(key,clean,mime):
    bucket().put_object(Bucket=bucket_name(),Key=key,Body=clean,ContentType=mime,CacheControl='private, max-age=0')

def presign(key,seconds=600):
    return bucket().generate_presigned_url('get_object',Params={'Bucket':bucket_name(),'Key':key},ExpiresIn=seconds)

def get_bytes(key,cap=250*1024*1024):
    response=bucket().get_object(Bucket=bucket_name(),Key=key)
    if response.get('ContentLength',0)>cap:raise ValueError('Object exceeds maximum')
    raw=response['Body'].read(cap+1)
    if len(raw)>cap:raise ValueError('Object exceeds maximum')
    return raw

def exists(key):
    try:return bucket().head_object(Bucket=bucket_name(),Key=key)
    except Exception:return None
