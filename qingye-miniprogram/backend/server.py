"""Local H5 + authenticated course/map management. Python standard library only."""
import argparse
import base64
import copy
import hashlib
import hmac
import io
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, unquote
import zipfile

ROOT=Path(__file__).resolve().parent
MAX_IMAGE=8*1024*1024

class Problem(Exception):
    def __init__(self,message,status=400):self.message=message;self.status=status

def text(value,limit=200):return str(value or '').strip()[:limit]
def password_hash(password,salt=None):
    if not isinstance(password,str) or not 8<=len(password)<=128:raise Problem('密码须为8–128个字符')
    salt=salt or secrets.token_hex(16)
    return salt+':'+hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),600000).hex()
def password_ok(password,stored):
    try:return hmac.compare_digest(password_hash(password,stored.split(':')[0]),stored)
    except (ValueError,Problem):return False

class Store:
    def __init__(self,directory=None):
        self.directory=Path(directory or ROOT/'data');self.directory.mkdir(parents=True,exist_ok=True)
        self.uploads=self.directory/'uploads';self.uploads.mkdir(exist_ok=True)
        self.path=self.directory/'management.sqlite3'
        self.base=json.loads((ROOT/'reference/courses.json').read_text())['courses']
        self.seed=json.loads((ROOT/'dist/course-maps.json').read_text())['items']
        with self.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL,password TEXT NOT NULL,created INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account_id TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS maps(id TEXT PRIMARY KEY,payload TEXT NOT NULL,filename TEXT NOT NULL,active INTEGER NOT NULL,updated INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS seed_visibility(id TEXT PRIMARY KEY,active INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,token TEXT UNIQUE NOT NULL,category TEXT NOT NULL,content TEXT NOT NULL,contact TEXT NOT NULL,status TEXT NOT NULL,reply TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
            ''')
        try:os.chmod(self.path,0o600)
        except OSError:pass
    def db(self):
        db=sqlite3.connect(self.path,timeout=15);db.row_factory=sqlite3.Row;return db
    def log(self,db,actor,action,target,detail=''):
        db.execute('INSERT INTO audit(actor,action,target,detail,created) VALUES(?,?,?,?,?)',(actor,action,target,text(detail,500),int(time.time())))
    @staticmethod
    def account(row):return {k:row[k] for k in ['id','username','name','role','active','created']}
    def accounts(self):
        with self.db() as db:return [self.account(r) for r in db.execute('SELECT * FROM accounts ORDER BY created,id')]
    def setup(self,body):
        username=text(body.get('username'),40)
        if not re.fullmatch(r'[A-Za-z0-9_.-]{3,40}',username):raise Problem('登录名须为3–40位字母、数字或_.-')
        hashed=password_hash(body.get('password'));uid=secrets.token_hex(12)
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT count(*) FROM accounts').fetchone()[0]:raise Problem('已完成初始化，请登录',409)
            db.execute('INSERT INTO accounts VALUES(?,?,?,?,?,?,?)',(uid,username,text(body.get('name') or username,40),'admin',1,hashed,int(time.time())))
            self.log(db,uid,'setup',uid,'创建首位管理员')
        return uid
    def login(self,body,ip):
        username=text(body.get('username'),40);key=ip+':'+username;now=int(time.time())
        with self.db() as db:
            db.execute('DELETE FROM attempts WHERE expires<?',(now,));a=db.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
            if a and a['count']>=10:raise Problem('尝试次数过多，请10分钟后重试',429)
            r=db.execute('SELECT * FROM accounts WHERE username=?',(username,)).fetchone()
            if not r or not r['active'] or not password_ok(body.get('password'),r['password']):
                db.execute('INSERT INTO attempts VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+1',(key,1,now+600));db.commit();raise Problem('登录名或密码错误，或账户已停用',401)
            db.execute('DELETE FROM attempts WHERE key=?',(key,));db.execute('DELETE FROM sessions WHERE expires<?',(now,))
            token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(24)
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),r['id'],csrf,now+12*3600));self.log(db,r['id'],'login',r['id'])
            return token,dict(user=self.account(r),csrf=csrf)
    def session(self,token):
        with self.db() as db:
            r=db.execute('SELECT a.*,s.csrf,s.token FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires>? AND a.active=1',(hashlib.sha256(token.encode()).hexdigest(),int(time.time()))).fetchone()
            if not r:raise Problem('请登录管理后台',401)
            return dict(r)
    def logout(self,session):
        with self.db() as db:db.execute('DELETE FROM sessions WHERE token=?',(session['token'],))
    def save_account(self,actor,body,uid=None):
        if actor['role']!='admin':raise Problem('只有管理员可管理账户',403)
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE');old=db.execute('SELECT * FROM accounts WHERE id=?',(uid,)).fetchone() if uid else None
            if uid and not old:raise Problem('账户不存在',404)
            role=body.get('role',old['role'] if old else 'editor')
            if role not in ['admin','editor','viewer']:raise Problem('权限类型无效')
            active=bool(body.get('active',True));name=text(body.get('name'),40)
            if not name:raise Problem('请填写显示名称')
            if old and old['active'] and old['role']=='admin' and (not active or role!='admin') and db.execute("SELECT count(*) FROM accounts WHERE active=1 AND role='admin'").fetchone()[0]<=1:raise Problem('至少保留一位启用的管理员')
            if old:
                hashed=password_hash(body['password']) if body.get('password') else old['password']
                db.execute('UPDATE accounts SET name=?,role=?,active=?,password=? WHERE id=?',(name,role,int(active),hashed,uid))
                if body.get('password') or not active or role!=old['role']:db.execute('DELETE FROM sessions WHERE account_id=?',(uid,))
            else:
                uid=secrets.token_hex(12);username=text(body.get('username'),40)
                if not re.fullmatch(r'[A-Za-z0-9_.-]{3,40}',username):raise Problem('登录名须为3–40位字母、数字或_.-')
                try:db.execute('INSERT INTO accounts VALUES(?,?,?,?,?,?,?)',(uid,username,name,role,int(active),password_hash(body.get('password')),int(time.time())))
                except sqlite3.IntegrityError:raise Problem('登录名已存在',409)
            self.log(db,actor['id'],'account.update' if old else 'account.create',uid,'权限='+role+'；状态='+('启用' if active else '停用'))
        return uid
    def catalog(self):
        result={c['id']:copy.deepcopy(c) for c in self.base}
        with self.db() as db:
            for r in db.execute('SELECT payload FROM courses'):c=json.loads(r['payload']);result[c['id']]=c
        return list(result.values())
    def overlays(self):
        with self.db() as db:return [json.loads(r[0]) for r in db.execute('SELECT payload FROM courses')]
    def revision(self):
        with self.db() as db:return db.execute('SELECT coalesce(max(id),0) FROM audit').fetchone()[0]
    def save_course(self,actor,body,cid=None):
        old=next((c for c in self.catalog() if c['id']==cid),None) if cid else None
        if cid and not old:raise Problem('球场不存在',404)
        c=copy.deepcopy(old or dict(id='admin_'+secrets.token_hex(10),nameEn='',aliases=[],pars=[],tees=[],teeData=[],segments=[],publicData=True,demo=False,photo=0,operationStatus='unknown',issues=[],sources=[],reportedHoles=None,reportedPar=None,holes=0,par=None))
        for field,limit in [('name',80),('province',40),('city',40),('address',250),('phone',80)]:c[field]=text(body.get(field,c.get(field)),limit)
        if not c['name'] or not c['province']:raise Problem('球场名称和地区必填')
        status=body.get('operationStatus',c.get('operationStatus','unknown'))
        if status not in ['unknown','open_confirmed','closed_reported']:raise Problem('营业状态无效')
        c['operationStatus']=status
        if any(field in body for field in ['latitude','longitude','coordinateSystem','coordinateStatus']):
            lat=body.get('latitude',c.get('latitude'));lng=body.get('longitude',c.get('longitude'))
            if lat in ['',None] and lng in ['',None]:
                c.update(latitude=None,longitude=None,coordinateSystem=None,coordinateStatus='missing')
            else:
                try:lat=float(lat);lng=float(lng)
                except (ValueError,TypeError):raise Problem('经纬度须为有效数字，或同时留空')
                if not (-90<=lat<=90 and -180<=lng<=180) or (lat==0 and lng==0):raise Problem('经纬度范围不正确')
                system=body.get('coordinateSystem',c.get('coordinateSystem')) or None
                if system not in [None,'gcj02','wgs84','bd09']:raise Problem('坐标系无效')
                verified=body.get('coordinateStatus',c.get('coordinateStatus'))=='verified'
                note=text(body.get('coordinateNote',c.get('coordinateNote')),300)
                if verified and (not system or not note):raise Problem('核实坐标时须选择坐标系并填写核实来源说明')
                c.update(latitude=lat,longitude=lng,coordinateSystem=system,coordinateStatus='verified' if verified else 'source_point_unverified',coordinateNote=note)
        if status=='open_confirmed' and not body.get('statusNote'):raise Problem('确认营业状态时请填写核实说明')
        if body.get('pars') is not None:
            pars=body['pars']
            if not isinstance(pars,list) or len(pars) not in [9,18,27,36] or any(type(p) is not int or p not in [3,4,5,6] for p in pars):raise Problem('逐洞Par需为9/18/27/36个3–6的整数')
            if old and len(pars)!=len(old['pars']) and not body.get('confirmLayout'):raise Problem('洞数改变，请确认重建洞段；原历史球局仍保留旧快照')
            segments=[]
            for i in range(0,len(pars),9):
                prev=old['segments'][i//9] if old and len(old['segments'])>i//9 else None
                sid=prev['id'] if prev else c['id']+'_s'+str(i//9+1)
                segments.append(dict(id=sid,name=prev['name'] if prev else chr(65+i//9)+' Course',holes=[dict(id=prev['holes'][j]['id'] if prev else sid+'_h'+str(j+1).zfill(2),label=prev['holes'][j]['label'] if prev else str(j+1),par=pars[i+j],si=prev['holes'][j].get('si') if prev else None,siStatus='admin_unconfirmed',sourceId='local_admin',siSourceId=None) for j in range(9)]))
            c.update(pars=pars,segments=segments,holes=len(pars),par=sum(pars))
            valid_ids={h['id'] for s in segments for h in s['holes']}
            for tee in c['teeData']:tee['distances']={k:v for k,v in tee['distances'].items() if k in valid_ids}
        c.update(publicData=True,retrievedOn=time.strftime('%Y-%m-%d'),adminUpdated=True,statusNote=text(body.get('statusNote',c.get('statusNote')),300))
        c['sources']=[s for s in c.get('sources',[]) if s.get('source_id')!='local_admin']+[dict(source_id='local_admin',title='本地后台录入 / 核对',url='/manage/',retrieved_on=c['retrievedOn'])]
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO courses VALUES(?,?,?)',(c['id'],json.dumps(c,ensure_ascii=False),int(time.time())))
            self.log(db,actor['id'],'course.update' if old else 'course.create',c['id'],c['name'])
        return c
    def maps(self,course_id=None,all_states=False):
        with self.db() as db:
            visibility={r['id']:bool(r['active']) for r in db.execute('SELECT * FROM seed_visibility')}
            items=[{**i,'active':visibility.get(i['id'],True)} for i in self.seed]
            items += [{**json.loads(r['payload']),'active':bool(r['active'])} for r in db.execute('SELECT * FROM maps ORDER BY updated DESC,rowid DESC')]
        return [i for i in items if (not course_id or i['courseId']==course_id) and (all_states or i['active'])]
    def upload(self,actor,body):
        course=next((c for c in self.catalog() if c['id']==body.get('courseId')),None)
        if not course:raise Problem('请选择有效球场')
        kind=body.get('kind');hid=body.get('holeId') if kind=='hole' else None
        if kind not in ['overview','hole']:raise Problem('请选择图片类型')
        if kind=='hole' and hid not in {h['id'] for s in course['segments'] for h in s['holes']}:raise Problem('球洞绑定无效，不能按名称或当前洞序号猜测')
        try:binary=base64.b64decode(body.get('image',''),validate=True)
        except (ValueError,TypeError):raise Problem('图片编码无效')
        if not binary or len(binary)>MAX_IMAGE:raise Problem('单张图片须在8MB以内')
        if binary.startswith(b'\x89PNG\r\n\x1a\n') and b'IEND' in binary[-12:]:ext='png'
        elif binary.startswith(b'\xff\xd8\xff') and binary.endswith(b'\xff\xd9'):ext='jpg'
        elif binary[:4]==b'RIFF' and binary[8:12]==b'WEBP' and int.from_bytes(binary[4:8],'little')+8==len(binary):ext='webp'
        else:raise Problem('仅支持完整的JPG、PNG或WebP图片，不接受SVG或其他文件')
        mid='upload_'+secrets.token_hex(12);filename=mid+'.'+ext;path=self.uploads/filename;path.write_bytes(binary)
        item=dict(id=mid,courseId=course['id'],kind=kind,holeId=hid,label=text(body.get('label') or ('球场总览' if kind=='overview' else '球道图'),80),url='/media/'+filename,sourceUrl=text(body.get('sourceUrl'),500),effectiveOn=text(body.get('effectiveOn'),20) or None,verified=body.get('verified') is True,active=True,sha256=hashlib.sha256(binary).hexdigest(),origin='admin_upload',note=text(body.get('note'),500),updatedAt=int(time.time()))
        if item['sourceUrl'] and not re.match(r'^https?://',item['sourceUrl']):path.unlink();raise Problem('来源链接须为http或https网址')
        try:
            with self.db() as db:
                db.execute('INSERT INTO maps VALUES(?,?,?,?,?)',(mid,json.dumps(item,ensure_ascii=False),filename,1,item['updatedAt']));self.log(db,actor['id'],'map.upload',mid,course['name']+' / '+(hid or 'overview'))
        except Exception:path.unlink();raise
        return item
    def visibility(self,actor,mid,active):
        if type(active) is not bool:raise Problem('图片状态无效')
        with self.db() as db:
            if any(i['id']==mid for i in self.seed):db.execute('INSERT OR REPLACE INTO seed_visibility VALUES(?,?)',(mid,int(active)))
            elif db.execute('SELECT id FROM maps WHERE id=?',(mid,)).fetchone():db.execute('UPDATE maps SET active=?,updated=? WHERE id=?',(int(active),int(time.time()),mid))
            else:raise Problem('图片不存在',404)
            self.log(db,actor['id'],'map.publish' if active else 'map.unpublish',mid)
    def audit(self):
        with self.db() as db:return [dict(r) for r in db.execute('SELECT l.*,coalesce(a.name,l.actor) actorName FROM audit l LEFT JOIN accounts a ON a.id=l.actor ORDER BY l.id DESC LIMIT 200')]

    def submit_feedback(self,body,ip):
        category=body.get('category');content=body.get('content');contact=body.get('contact','');token=body.get('receiptToken','')
        if category not in ['体验建议','功能异常','球场资料纠错','版权与合作']:raise Problem('请选择反馈类型')
        if not isinstance(content,str) or not 5<=len(content.strip())<=2000:raise Problem('请填写5–2000字的问题描述')
        if not isinstance(contact,str) or len(contact)>120:raise Problem('联系方式请控制在120字以内')
        if not isinstance(token,str) or not re.fullmatch(r'[a-f0-9]{64}',token):raise Problem('反馈凭证无效，请刷新后重试')
        hashed=hashlib.sha256(token.encode()).hexdigest();now=int(time.time())
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT id FROM feedback WHERE token=?',(hashed,)).fetchone()
            if old:return dict(id=old['id'],duplicate=True)
            key='feedback:'+ip;attempt=db.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
            if attempt and attempt['expires']>now and attempt['count']>=20:raise Problem('提交较频繁，请稍后再试，草稿会为你保留',429)
            count=attempt['count']+1 if attempt and attempt['expires']>now else 1
            expiry=attempt['expires'] if attempt and attempt['expires']>now else now+3600
            db.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,count,expiry))
            fid='FB'+secrets.token_hex(6).upper()
            db.execute('INSERT INTO feedback VALUES(?,?,?,?,?,?,?,?,?)',(fid,hashed,category,content.strip(),contact.strip(),'new','',now,now))
            self.log(db,'public','feedback.create',fid,'收到一条用户反馈')
        return dict(id=fid,duplicate=False)
    def feedback(self):
        with self.db() as db:return [dict(r) for r in db.execute('SELECT id,category,content,contact,status,reply,created,updated FROM feedback ORDER BY created DESC,rowid DESC')]
    def feedback_receipt(self,fid,token):
        if not isinstance(token,str):raise Problem('反馈凭证无效',403)
        with self.db() as db:r=db.execute('SELECT * FROM feedback WHERE id=?',(fid,)).fetchone()
        if not r or not hmac.compare_digest(r['token'],hashlib.sha256(token.encode()).hexdigest()):raise Problem('反馈不存在或凭证不匹配',404)
        return {k:r[k] for k in ['id','category','content','contact','status','reply','created','updated']}
    def reply_feedback(self,actor,fid,body):
        if actor['role']!='admin':raise Problem('只有管理员可处理用户反馈',403)
        reply=body.get('reply','');status=body.get('status')
        if status not in ['new','reading','replied','closed']:raise Problem('反馈状态无效')
        if not isinstance(reply,str) or len(reply)>2000:raise Problem('回复请控制在2000字以内')
        if status=='replied' and not reply.strip():raise Problem('请填写回复内容')
        with self.db() as db:
            if not db.execute('SELECT id FROM feedback WHERE id=?',(fid,)).fetchone():raise Problem('反馈不存在',404)
            db.execute('UPDATE feedback SET status=?,reply=?,updated=? WHERE id=?',(status,reply.strip(),int(time.time()),fid))
            self.log(db,actor['id'],'feedback.update',fid,'状态='+status)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
    @property
    def store(self):return self.server.store
    def end_headers(self):
        
        if self.path.startswith('/manage/') or urlsplit(self.path).path in ['/','/index.html'] or urlsplit(self.path).path.endswith(('.js','.css')):self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Referrer-Policy','same-origin');super().end_headers()
    def send_json(self,data,status=200,cookie=None):
        body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)))
        if cookie:self.send_header('Set-Cookie',cookie+('; Secure' if os.environ.get('QINGYE_PUBLIC_ORIGIN','').startswith('https://') else ''))
        self.end_headers();self.wfile.write(body)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path.startswith('/api/'):return self.api('GET')
        if path.startswith('/media/'):
            filename=unquote(path.removeprefix('/media/'))
            if not re.fullmatch(r'upload_[a-f0-9]{24}\.(jpg|png|webp)',filename):return self.send_error(404)
            file=self.store.uploads/filename
            if not file.is_file():return self.send_error(404)
            self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(filename)[0]);self.send_header('Content-Length',str(file.stat().st_size));self.send_header('Cache-Control','public,max-age=3600');self.end_headers();self.wfile.write(file.read_bytes());return
        super().do_GET()
    def do_POST(self):self.api('POST')
    def do_PUT(self):self.api('PUT')
    def token(self):
        jar=cookies.SimpleCookie()
        try:jar.load(self.headers.get('Cookie',''))
        except cookies.CookieError:pass
        return jar['qingye_admin'].value if 'qingye_admin' in jar else ''
    def api(self,method):
        try:
            path=urlsplit(self.path).path;query=parse_qs(urlsplit(self.path).query);host=self.headers.get('Host','');port=self.server.server_port
            public=urlsplit(os.environ.get('QINGYE_PUBLIC_ORIGIN',''))
            public_origin=public.geturl().rstrip('/') if public.scheme=='https' and public.netloc and not public.path.strip('/') else ''
            allowed_hosts=[f'127.0.0.1:{port}',f'localhost:{port}']+([public.netloc] if public_origin else [])
            if host not in allowed_hosts:raise Problem('请求主机不在服务配置中',403)
            body={}
            if method!='GET':
                origin=self.headers.get('Origin')
                if origin and origin not in [f'http://127.0.0.1:{port}',f'http://localhost:{port}']+([public_origin] if public_origin else []):raise Problem('请求来源不被允许',403)
                if self.headers.get('Sec-Fetch-Site')=='cross-site':raise Problem('请求来源不被允许',403)
                if self.headers.get('Content-Type','').split(';')[0]!='application/json':raise Problem('请求须使用JSON',415)
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<12*1024*1024:raise Problem('请求内容过大或为空',413)
                try:body=json.loads(self.rfile.read(length))
                except (ValueError,UnicodeDecodeError):raise Problem('请求数据无效')
                if not isinstance(body,dict):raise Problem('请求内容须为对象')
            if path=='/api/catalog' and method=='GET':return self.send_json(dict(revision=self.store.revision(),courses=self.store.overlays()))
            if path=='/api/maps' and method=='GET':return self.send_json(dict(items=self.store.maps(query.get('courseId',[None])[0])))
            if path=='/api/feedback' and method=='POST':return self.send_json(self.store.submit_feedback(body,self.client_address[0]),201)
            if path.startswith('/api/feedback/') and method=='GET':return self.send_json(self.store.feedback_receipt(path.split('/')[-1],self.headers.get('X-Feedback-Token','')))
            if path=='/api/auth/state' and method=='GET':return self.send_json(dict(needsSetup=not self.store.accounts()))
            if path=='/api/auth/setup' and method=='POST':self.store.setup(body);return self.send_json(dict(ok=True),201)
            if path=='/api/auth/login' and method=='POST':
                token,data=self.store.login(body,self.client_address[0]);return self.send_json(data,cookie='qingye_admin='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200')
            session=self.store.session(self.token())
            if method!='GET' and not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),session['csrf']):raise Problem('会话校验失败，请重新登录',403)
            if path=='/api/auth/session' and method=='GET':return self.send_json(dict(user=self.store.account(session),csrf=session['csrf']))
            if path=='/api/auth/logout' and method=='POST':self.store.logout(session);return self.send_json(dict(ok=True),cookie='qingye_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
            if not path.startswith('/api/admin/'):raise Problem('接口不存在',404)
            if session['role']=='viewer' and (method!='GET' or path not in ['/api/admin/catalog','/api/admin/maps']):raise Problem('只读账户仅可查看球场与图片资料',403)
            if path=='/api/admin/catalog' and method=='GET':return self.send_json(dict(courses=self.store.catalog(),revision=self.store.revision()))
            if path=='/api/admin/maps' and method=='GET':return self.send_json(dict(items=self.store.maps(query.get('courseId',[None])[0],True)))
            if path=='/api/admin/maps' and method=='POST':return self.send_json(self.store.upload(session,body),201)
            if path.startswith('/api/admin/maps/') and method=='PUT':self.store.visibility(session,path.split('/')[-1],body.get('active'));return self.send_json(dict(ok=True))
            if path=='/api/admin/courses' and method=='POST':return self.send_json(self.store.save_course(session,body),201)
            if path.startswith('/api/admin/courses/') and method=='PUT':return self.send_json(self.store.save_course(session,body,path.split('/')[-1]))
            if path.startswith('/api/admin/accounts'):
                if session['role']!='admin':raise Problem('只有管理员可管理账户',403)
                if method=='GET' and path=='/api/admin/accounts':return self.send_json(dict(items=self.store.accounts()))
                if method in ['POST','PUT']:
                    uid=path.split('/')[-1] if method=='PUT' else None;return self.send_json(dict(id=self.store.save_account(session,body,uid)))
            if path.startswith('/api/admin/feedback'):
                if session['role']!='admin':raise Problem('只有管理员可处理用户反馈',403)
                if path=='/api/admin/feedback' and method=='GET':return self.send_json(dict(items=self.store.feedback()))
                if method=='PUT' and path.startswith('/api/admin/feedback/'):
                    self.store.reply_feedback(session,path.split('/')[-1],body);return self.send_json(dict(ok=True))
            if path=='/api/admin/audit' and method=='GET':return self.send_json(dict(items=self.store.audit()))
            if path=='/api/admin/backup' and method=='GET':
                if session['role']!='admin':raise Problem('只有管理员可导出后台备份',403)
                buf=io.BytesIO()
                with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
                    z.writestr('management.json',json.dumps(dict(version=1,courses=self.store.overlays(),maps=self.store.maps(all_states=True),accounts=self.store.accounts(),feedback=self.store.feedback(),audit=self.store.audit()),ensure_ascii=False))
                    for file in self.store.uploads.iterdir():
                        if file.is_file():z.write(file,'uploads/'+file.name)
                data=buf.getvalue();self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Disposition','attachment; filename=qingye-management-backup.zip');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
            raise Problem('接口不存在',404)
        except Problem as e:self.send_json(dict(error=e.message),e.status)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as e:
            self.log_error('API error: %s',type(e).__name__);self.send_json(dict(error='操作未完成，请重试；原资料保留'),500)

def make_server(port=8767,data_dir=None):
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler);server.store=Store(data_dir);return server
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8767);parser.add_argument('--data-dir');args=parser.parse_args()
    server=make_server(args.port,args.data_dir);print(f'Qingye H5: http://127.0.0.1:{args.port}/  Admin: /manage/',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
