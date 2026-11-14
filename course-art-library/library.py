"""Local, self-contained golf artwork archive. Files are stored inside SQLite."""
import hashlib,json,sqlite3,struct,uuid,zlib,math,io,zipfile
from pathlib import Path
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parent
DB=ROOT/'球道图库.sqlite3'
def now(): return datetime.now(timezone.utc).isoformat(timespec='seconds')
def pack(value): return json.dumps(value,ensure_ascii=False)

SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,name TEXT NOT NULL,province TEXT,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS holes(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id),segment_id TEXT,segment_name TEXT,label TEXT NOT NULL,ordinal INTEGER NOT NULL,par INTEGER);
CREATE TABLE IF NOT EXISTS assets(sha256 TEXT PRIMARY KEY,mime TEXT NOT NULL,filename TEXT NOT NULL,width INTEGER,height INTEGER,body BLOB NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reference_files(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id),hole_id TEXT REFERENCES holes(id),asset_sha TEXT NOT NULL REFERENCES assets(sha256),role TEXT NOT NULL,source_url TEXT,metadata TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,hole_id TEXT NOT NULL REFERENCES holes(id),number INTEGER NOT NULL,asset_sha TEXT NOT NULL REFERENCES assets(sha256),title TEXT NOT NULL,note TEXT NOT NULL,prompt TEXT NOT NULL,metadata TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(hole_id,number),UNIQUE(hole_id,asset_sha));
CREATE TABLE IF NOT EXISTS version_references(version_id TEXT NOT NULL REFERENCES versions(id),reference_id TEXT NOT NULL REFERENCES reference_files(id),PRIMARY KEY(version_id,reference_id));
CREATE TABLE IF NOT EXISTS current_versions(hole_id TEXT PRIMARY KEY REFERENCES holes(id),version_id TEXT NOT NULL REFERENCES versions(id));
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,hole_id TEXT NOT NULL REFERENCES holes(id),action TEXT NOT NULL,version_id TEXT REFERENCES versions(id),note TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY,version_id TEXT NOT NULL REFERENCES versions(id),status TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(version_id,status,detail));
CREATE INDEX IF NOT EXISTS holes_course ON holes(course_id,ordinal);
CREATE INDEX IF NOT EXISTS references_hole ON reference_files(hole_id);
CREATE INDEX IF NOT EXISTS versions_hole ON versions(hole_id,number);
CREATE TRIGGER IF NOT EXISTS current_insert_guard BEFORE INSERT ON current_versions BEGIN SELECT CASE WHEN (SELECT hole_id FROM versions WHERE id=NEW.version_id) != NEW.hole_id THEN RAISE(ABORT,'version belongs to another hole') END; END;
CREATE TRIGGER IF NOT EXISTS current_update_guard BEFORE UPDATE ON current_versions BEGIN SELECT CASE WHEN (SELECT hole_id FROM versions WHERE id=NEW.version_id) != NEW.hole_id THEN RAISE(ABORT,'version belongs to another hole') END; END;
CREATE TABLE IF NOT EXISTS gps_versions(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id),number INTEGER NOT NULL,digest TEXT NOT NULL,title TEXT NOT NULL,document TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(course_id,number),UNIQUE(course_id,digest));
CREATE TABLE IF NOT EXISTS gps_files(version_id TEXT NOT NULL REFERENCES gps_versions(id),path TEXT NOT NULL,asset_sha TEXT NOT NULL REFERENCES assets(sha256),PRIMARY KEY(version_id,path));
CREATE TABLE IF NOT EXISTS current_gps(course_id TEXT PRIMARY KEY REFERENCES courses(id),version_id TEXT NOT NULL REFERENCES gps_versions(id));
CREATE TABLE IF NOT EXISTS gps_history(id INTEGER PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id),version_id TEXT NOT NULL REFERENCES gps_versions(id),action TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS gps_current_insert_guard BEFORE INSERT ON current_gps BEGIN SELECT CASE WHEN (SELECT course_id FROM gps_versions WHERE id=NEW.version_id) != NEW.course_id THEN RAISE(ABORT,'GPS version belongs to another course') END; END;
CREATE TRIGGER IF NOT EXISTS gps_current_update_guard BEFORE UPDATE ON current_gps BEGIN SELECT CASE WHEN (SELECT course_id FROM gps_versions WHERE id=NEW.version_id) != NEW.course_id THEN RAISE(ABORT,'GPS version belongs to another course') END; END;
PRAGMA user_version=2;
'''

class Library:
 def __init__(self,path=DB):
  self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
  self.db=sqlite3.connect(self.path,timeout=30);self.db.row_factory=sqlite3.Row
  self.db.execute('PRAGMA foreign_keys=ON');self.db.executescript(SCHEMA)
 def close(self): self.db.close()
 def rows(self,sql,args=()): return [dict(r) for r in self.db.execute(sql,args)]
 def catalog(self,document):
  with self.db:
   for c in document['courses']:
    self.db.execute('INSERT INTO courses VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,province=excluded.province,payload=excluded.payload',(c['id'],c['name'],c.get('province',''),pack(c)))
    ordinal=0
    for segment in c.get('segments',[]):
     for h in segment['holes']:
      ordinal+=1
      self.db.execute('INSERT INTO holes VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET segment_name=excluded.segment_name,label=excluded.label,ordinal=excluded.ordinal,par=excluded.par',(h['id'],c['id'],segment['id'],segment['name'],h['label'],ordinal,h.get('par')))
 def asset(self,data,filename,mime=None):
  sha=hashlib.sha256(data).hexdigest();w=h=None
  if data.startswith(b'\x89PNG\r\n\x1a\n'):
   if len(data)<33 or data[12:16]!=b'IHDR':raise ValueError('PNG 文件不完整')
   mime='image/png';w,h=struct.unpack('>II',data[16:24])
   if not 0<w<=20000 or not 0<h<=20000:raise ValueError('图片尺寸超出范围')
   pos=8;has_idat=False;ended=False
   while pos+12<=len(data):
    length=struct.unpack('>I',data[pos:pos+4])[0];kind=data[pos+4:pos+8];end=pos+12+length
    if end>len(data):raise ValueError('PNG 文件已截断')
    expected=struct.unpack('>I',data[end-4:end])[0]
    if zlib.crc32(data[pos+4:end-4])&0xffffffff!=expected:raise ValueError('PNG 文件校验失败')
    has_idat=has_idat or kind==b'IDAT';pos=end
    if kind==b'IEND':ended=True;break
   if not has_idat or not ended or pos!=len(data):raise ValueError('PNG 文件不完整')
  elif data.startswith(b'\xff\xd8'):mime='image/jpeg'
  elif len(data)>=14 and data[:6] in (b'GIF87a',b'GIF89a') and data.endswith(b';'):
   mime='image/gif';w,h=struct.unpack('<HH',data[6:10])
  elif data[:4]==b'RIFF' and data[8:12]==b'WEBP':mime='image/webp'
  else:mime=mime or ('application/json' if filename.endswith('.json') else 'text/plain; charset=utf-8')
  self.db.execute('INSERT OR IGNORE INTO assets VALUES(?,?,?,?,?,?,?)',(sha,mime,Path(filename).name,w,h,data,now()))
  return sha
 def reference(self,course_id,hole_id,path,role,source_url='',metadata=None):
  path=Path(path);data=path.read_bytes()
  with self.db:
   if hole_id:
    r=self.db.execute('SELECT course_id FROM holes WHERE id=?',(hole_id,)).fetchone()
    if not r or r[0]!=course_id:raise ValueError('参考资料球场与洞号不匹配')
   sha=self.asset(data,path.name)
   rid=hashlib.sha256((course_id+'|'+str(hole_id)+'|'+role+'|'+sha).encode()).hexdigest()
   meta=dict(metadata or {},originalPath=str(path.resolve()))
   self.db.execute('INSERT OR IGNORE INTO reference_files VALUES(?,?,?,?,?,?,?,?)',(rid,course_id,hole_id,sha,role,source_url,pack(meta),now()))
  return rid
 def version(self,hole_id,data,filename,title,note='',prompt='',metadata=None,references=(),select=True):
  with self.db:
   if not self.db.execute('SELECT 1 FROM holes WHERE id=?',(hole_id,)).fetchone():raise ValueError('未找到球洞')
   if not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('高精图请使用 PNG 文件')
   sha=self.asset(data,filename)
   old=self.db.execute('SELECT id FROM versions WHERE hole_id=? AND asset_sha=?',(hole_id,sha)).fetchone()
   if old:vid=old[0];inserted=False
   else:
    number=self.db.execute('SELECT coalesce(max(number),0)+1 FROM versions WHERE hole_id=?',(hole_id,)).fetchone()[0]
    vid=uuid.uuid4().hex;inserted=True
    self.db.execute('INSERT INTO versions VALUES(?,?,?,?,?,?,?,?,?)',(vid,hole_id,number,sha,title,note,prompt,pack(metadata or {}),now()))
    self.db.execute('INSERT INTO history(hole_id,action,version_id,note,created_at) VALUES(?,?,?,?,?)',(hole_id,'created',vid,note,now()))
   course=self.db.execute('SELECT course_id FROM holes WHERE id=?',(hole_id,)).fetchone()[0]
   for ref in references:
    r=self.db.execute('SELECT course_id,hole_id FROM reference_files WHERE id=?',(ref,)).fetchone()
    if not r or r[0]!=course or (r[1] and r[1]!=hole_id):raise ValueError('版本引用了其他球场或球洞的参考资料')
    self.db.execute('INSERT OR IGNORE INTO version_references VALUES(?,?)',(vid,ref))
   # Re-importing archives never resets a user's later selection.
   if inserted and select:self._select(hole_id,vid,'导入新版本')
  return vid,inserted
 def _select(self,hole_id,vid,note):
  row=self.db.execute('SELECT hole_id FROM versions WHERE id=?',(vid,)).fetchone()
  if not row or row[0]!=hole_id:raise ValueError('该版本不属于此球洞')
  self.db.execute('INSERT INTO current_versions VALUES(?,?) ON CONFLICT(hole_id) DO UPDATE SET version_id=excluded.version_id',(hole_id,vid))
  self.db.execute('INSERT INTO history(hole_id,action,version_id,note,created_at) VALUES(?,?,?,?,?)',(hole_id,'selected',vid,note,now()))
 def select(self,hole_id,vid,note='设为当前版本'):
  with self.db:self._select(hole_id,vid,note)
 def review(self,vid,status,detail):
  with self.db:self.db.execute('INSERT OR IGNORE INTO reviews(version_id,status,detail,created_at) VALUES(?,?,?,?)',(vid,status,pack(detail),now()))
 def courses(self):
  rows=self.rows('''SELECT c.id,c.name,c.province,count(DISTINCT h.id) hole_count,count(DISTINCT cv.hole_id) art_count,(SELECT count(*) FROM reference_files r WHERE r.course_id=c.id) reference_count FROM courses c LEFT JOIN holes h ON h.course_id=c.id LEFT JOIN current_versions cv ON cv.hole_id=h.id GROUP BY c.id ORDER BY art_count DESC,reference_count DESC,c.name''')
  for row in rows:
   gps=self.db.execute('SELECT v.document FROM current_gps c JOIN gps_versions v ON v.id=c.version_id WHERE c.course_id=?',(row['id'],)).fetchone()
   row['gps_count']=len(json.loads(gps[0]).get('holes',[])) if gps else 0
   row['gps_available']=bool(gps)
  return rows
 def course(self,cid):
  course=self.db.execute('SELECT id,name,province FROM courses WHERE id=?',(cid,)).fetchone()
  if not course:raise ValueError('未找到球场')
  holes=self.rows('''SELECT h.*,cv.version_id,v.title,v.asset_sha,a.width,a.height,(SELECT count(*) FROM versions v2 WHERE v2.hole_id=h.id) version_count,(SELECT count(*) FROM reference_files r WHERE r.hole_id=h.id) reference_count FROM holes h LEFT JOIN current_versions cv ON cv.hole_id=h.id LEFT JOIN versions v ON v.id=cv.version_id LEFT JOIN assets a ON a.sha256=v.asset_sha WHERE h.course_id=? ORDER BY h.ordinal''',(cid,))
  return dict(course,holes=holes)
 def hole(self,hid):
  hole=self.db.execute('SELECT h.*,c.name course_name FROM holes h JOIN courses c ON c.id=h.course_id WHERE h.id=?',(hid,)).fetchone()
  if not hole:raise ValueError('未找到球洞')
  vs=self.rows('SELECT v.*,a.width,a.height,a.filename FROM versions v JOIN assets a ON a.sha256=v.asset_sha WHERE hole_id=? ORDER BY number DESC',(hid,))
  for v in vs:
   v['metadata']=json.loads(v['metadata']);v['references']=[r['reference_id'] for r in self.rows('SELECT reference_id FROM version_references WHERE version_id=?',(v['id'],))]
   review=self.db.execute('SELECT status,detail,created_at FROM reviews WHERE version_id=? ORDER BY id DESC LIMIT 1',(v['id'],)).fetchone()
   if review:v['metadata']['reviewStatus']=review['status'];v['metadata']['latestReview']=dict(review)
  refs=self.rows('SELECT r.*,a.mime,a.filename FROM reference_files r JOIN assets a ON a.sha256=r.asset_sha WHERE r.hole_id=? OR (r.course_id=? AND r.hole_id IS NULL) ORDER BY r.hole_id DESC,r.role',(hid,hole['course_id']))
  for r in refs:r['metadata']=json.loads(r['metadata'])
  cur=self.db.execute('SELECT version_id FROM current_versions WHERE hole_id=?',(hid,)).fetchone()
  return dict(hole,current=cur[0] if cur else None,versions=vs,references=refs,history=self.rows('SELECT * FROM history WHERE hole_id=? ORDER BY id DESC',(hid,)))
 def backup(self,target=None):
  target=Path(target) if target else ROOT/'backups'/('球道图库-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:5]+'.sqlite3')
  target.parent.mkdir(parents=True,exist_ok=True)
  with sqlite3.connect(target) as dest:self.db.backup(dest)
  return target


 def save_gps(self,cid,document,files,title,expected_current=...,select=True):
  """Store a complete, self-contained GPS revision in one transaction."""
  if not isinstance(document,dict) or document.get('courseId')!=cid:
   raise ValueError('GPS 数据与球场不匹配')
  canonical=json.dumps(document,ensure_ascii=False,sort_keys=True,allow_nan=False)
  holes=document.get('holes')
  if not isinstance(holes,list):raise ValueError('GPS 球洞清单格式无效')
  known={r[0] for r in self.db.execute('SELECT id FROM holes WHERE course_id=?',(cid,))}
  if not self.db.execute('SELECT 1 FROM courses WHERE id=?',(cid,)).fetchone():
   raise ValueError('未找到球场档案')
  seen=set()
  for hole in holes:
   if not isinstance(hole,dict):raise ValueError('GPS 球洞记录格式无效')
   hid=hole.get('_id') or hole.get('id')
   if hid not in known or hid in seen:raise ValueError('GPS 球洞身份不匹配或重复')
   seen.add(hid)
   def point(p):
    return isinstance(p,list) and len(p)==2 and all(type(v) in (int,float) and math.isfinite(v) for v in p) and -180<=p[0]<=180 and -90<p[1]<90
   if not all(point(hole.get(key)) for key in ('tee','target','green')):
    raise ValueError('GPS 起点、落点或终点无效')
   for key,minimum in [('greenOutline',3),('route',2)]:
    polygon=hole.get(key)
    if not isinstance(polygon,list) or len(polygon)<minimum or not all(point(p) for p in polygon):
     raise ValueError('GPS 果岭轮廓或路线无效')
  if holes and seen!=known and document.get('scope')!='partial':
   raise ValueError('整场 GPS 清单不完整，部分数据须明确标记 partial')
  if not holes and document.get('kind')!='overview':
   raise ValueError('无逐洞数据时应标为 overview')
  prepared=[]
  for name,source in sorted(files.items()):
   path=Path(name)
   if path.is_absolute() or path.as_posix()!=name or '..' in path.parts or '\\' in name or name in ('','.','gps-document.json','gps-files.json'):
    raise ValueError('GPS 附件路径无效')
   data=Path(source).read_bytes()
   prepared.append((name,data,hashlib.sha256(data).hexdigest()))
  digest=hashlib.sha256((canonical+json.dumps([(n,s) for n,_,s in prepared],ensure_ascii=False)).encode()).hexdigest()
  with self.db:
   self.db.execute('BEGIN IMMEDIATE')
   current=self.db.execute('SELECT version_id FROM current_gps WHERE course_id=?',(cid,)).fetchone()
   current=current[0] if current else None
   if expected_current is not ... and expected_current!=current:
    raise ValueError('GPS 当前版本已变化，请重新读取后再保存')
   old=self.db.execute('SELECT id FROM gps_versions WHERE course_id=? AND digest=?',(cid,digest)).fetchone()
   if old:return old[0],False
   number=self.db.execute('SELECT coalesce(max(number),0)+1 FROM gps_versions WHERE course_id=?',(cid,)).fetchone()[0]
   vid=uuid.uuid4().hex
   self.db.execute('INSERT INTO gps_versions VALUES(?,?,?,?,?,?,?)',(vid,cid,number,digest,title,canonical,now()))
   for name,data,sha in prepared:
    stored=self.asset(data,Path(name).name)
    self.db.execute('INSERT INTO gps_files VALUES(?,?,?)',(vid,name,stored))
   if select:
    self.db.execute('INSERT INTO current_gps VALUES(?,?) ON CONFLICT(course_id) DO UPDATE SET version_id=excluded.version_id',(cid,vid))
   self.db.execute('INSERT INTO gps_history(course_id,version_id,action,created_at) VALUES(?,?,?,?)',(cid,vid,'created',now()))
  return vid,True

 def gps(self,cid,version=None):
  course=self.db.execute('SELECT id,name FROM courses WHERE id=?',(cid,)).fetchone()
  if not course:raise ValueError('未找到球场')
  current=self.db.execute('SELECT version_id FROM current_gps WHERE course_id=?',(cid,)).fetchone()
  current=current[0] if current else None
  versions=self.rows('SELECT id,number,title,digest,created_at FROM gps_versions WHERE course_id=? ORDER BY number DESC',(cid,))
  selected=version or current
  row=self.db.execute('SELECT document FROM gps_versions WHERE id=? AND course_id=?',(selected,cid)).fetchone() if selected else None
  if selected and not row:raise ValueError('GPS 版本不属于此球场')
  files=self.rows('SELECT f.path,f.asset_sha,a.mime FROM gps_files f JOIN assets a ON a.sha256=f.asset_sha WHERE f.version_id=? ORDER BY f.path',(selected,)) if row else []
  return dict(course,current=current,selected=selected,versions=versions,document=json.loads(row[0]) if row else None,files=files)

 def select_gps(self,cid,vid,expected_current):
  with self.db:
   self.db.execute('BEGIN IMMEDIATE')
   existing=self.db.execute('SELECT course_id FROM gps_versions WHERE id=?',(vid,)).fetchone()
   if not existing or existing[0]!=cid:raise ValueError('GPS 版本不属于此球场')
   current=self.db.execute('SELECT version_id FROM current_gps WHERE course_id=?',(cid,)).fetchone()
   if (current[0] if current else None)!=expected_current:raise ValueError('GPS 当前版本已变化，请刷新后重试')
   self.db.execute('INSERT INTO current_gps VALUES(?,?) ON CONFLICT(course_id) DO UPDATE SET version_id=excluded.version_id',(cid,vid))
   self.db.execute('INSERT INTO gps_history(course_id,version_id,action,created_at) VALUES(?,?,?,?)',(cid,vid,'selected',now()))

 def export_gps(self,cid,version=None):
  snapshot=self.gps(cid,version)
  if not snapshot['document']:raise ValueError('该球场尚未存入 GPS 地图')
  output=io.BytesIO()
  with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
   archive.writestr('gps-document.json',json.dumps(snapshot['document'],ensure_ascii=False,indent=2))
   archive.writestr('gps-files.json',json.dumps(snapshot['files'],ensure_ascii=False,indent=2))
   for file in snapshot['files']:
    data=self.db.execute('SELECT body FROM assets WHERE sha256=?',(file['asset_sha'],)).fetchone()[0]
    archive.writestr(file['path'],data)
  return output.getvalue()
