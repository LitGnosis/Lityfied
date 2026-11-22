"""Atomic provider-spend reservation under a shared daily project cap.

Pricing must be verified before enabling submissions. Unknown submissions remain reserved.
"""
from __future__ import annotations
import os, uuid, hashlib
from decimal import Decimal
from datetime import datetime, timezone
from psycopg.rows import dict_row
from store import db

CAP=Decimal(os.getenv('RENDER_DAILY_HARD_CAP_USD','2.00'))
PROJECT_CAP=int(os.getenv('RENDER_MAX_SCENES_PER_PROJECT_PER_DAY','2'))
LIB_CAP=int(os.getenv('RENDER_MAX_SCENES_PER_LIBRARY_PER_DAY','2'))
ACTIVE=['reserved','submitting','submitted','running','ready','completed','unknown']

def reserve(library,project,scene,digest,price,mode,model):
    if price<=0 or price>CAP:raise ValueError('Request exceeds daily account budget')
    day=datetime.now(timezone.utc).date()
    with db() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # advisory lock serializes ALL account budget and library/project counters for a day
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('lityfied-budget-'+day.isoformat(),))
            cur.execute('SELECT id,status FROM render_jobs WHERE library_id=%s AND request_digest=%s',(library,digest))
            old=cur.fetchone()
            if old:return {'id':str(old['id']),'status':old['status'],'deduplicated':True}
            cur.execute('SELECT coalesce(sum(estimated_usd),0) AS total FROM render_jobs WHERE day=%s AND status=ANY(%s)',(day,ACTIVE))
            spent=Decimal(cur.fetchone()['total'])
            if spent+price>CAP:raise ValueError('Global AI budget reached')
            cur.execute('SELECT count(*) AS n FROM render_jobs WHERE day=%s AND library_id=%s AND status=ANY(%s)',(day,library,ACTIVE))
            if cur.fetchone()['n']>=LIB_CAP:raise ValueError('Library daily scene limit reached')
            cur.execute('SELECT count(*) AS n FROM render_jobs WHERE day=%s AND project_id=%s AND status=ANY(%s)',(day,project,ACTIVE))
            if cur.fetchone()['n']>=PROJECT_CAP:raise ValueError('Project daily scene limit reached')
            jid=uuid.uuid4()
            cur.execute('INSERT INTO render_jobs(id,project_id,scene_id,library_id,day,estimated_usd,model,mode,request_digest,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(jid,project,scene,library,day,price,model,mode,digest,'reserved'))
            return {'id':str(jid),'status':'reserved','deduplicated':False}
