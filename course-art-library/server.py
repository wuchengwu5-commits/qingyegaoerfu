from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs,unquote,quote
from pathlib import Path
import base64,json,secrets,argparse,webbrowser,threading
from library import Library,ROOT,DB,pack
from inventory import course_inventory, resources

TOKEN=secrets.token_urlsafe(32)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def send(self,status,data,mime='application/json; charset=utf-8',filename=None):
  if not isinstance(data,bytes):data=(pack(data) if not isinstance(data,str) else data).encode()
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)))
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'")
  if filename:self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+quote(filename))
  try:self.end_headers();self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass
 def valid_host(self):
  return self.headers.get('Host','') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
 def do_GET(self):
  if not self.valid_host():return self.send(403,{'error':'请从本机地址打开图库'})
  u=urlparse(self.path);p=unquote(u.path);q=parse_qs(u.query);lib=Library(self.server.db_path)
  try:
   if p=='/api/config':return self.send(200,{'token':TOKEN})
   if p=='/api/courses':return self.send(200,lib.courses())
   if p=='/api/inventory':return self.send(200,course_inventory(lib))
   if p=='/api/resources':return self.send(200,resources(lib,q.get('id',[''])[0]))
   if p=='/api/course':return self.send(200,lib.course(q.get('id',[''])[0]))
   if p=='/api/hole':return self.send(200,lib.hole(q.get('id',[''])[0]))
   if p=='/api/gps':return self.send(200,lib.gps(q.get('id',[''])[0],q.get('version',[None])[0]))
   if p=='/api/export-gps':
    cid=q.get('id',[''])[0]
    return self.send(200,lib.export_gps(cid,q.get('version',[None])[0]),'application/zip',cid+'-GPS地图.zip')
   if p.startswith('/asset/'):
    row=lib.db.execute('SELECT body,mime,filename FROM assets WHERE sha256=?',(p[7:],)).fetchone()
    if not row:return self.send(404,{'error':'素材不存在'})
    return self.send(200,row[0],row[1],row[2] if 'download' in q else None)
   if p in ('/','/app.js','/inventory.js','/style.css'):
    f=ROOT/'web'/({'/':'index.html'}.get(p,p[1:]));mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[f.suffix]
    return self.send(200,f.read_bytes(),mime)
   return self.send(404,{'error':'页面不存在'})
  except ValueError as e:self.send(400,{'error':str(e)})
  finally:lib.close()
 def do_POST(self):
  if not self.valid_host() or self.headers.get('X-Library-Token')!=TOKEN:return self.send(403,{'error':'请刷新图库后重试'})
  origin=self.headers.get('Origin')
  if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:return self.send(403,{'error':'仅允许本机图库修改'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size<1 or size>48*1024*1024:raise ValueError('文件过大，请选择 32 MB 以内的 PNG')
   obj=json.loads(self.rfile.read(size));lib=Library(self.server.db_path)
   try:
    if self.path=='/api/select':lib.select(obj['holeId'],obj['versionId']);result={'ok':True}
    elif self.path=='/api/select-gps':
     lib.select_gps(obj['courseId'],obj['versionId'],obj['expectedCurrent']);result={'ok':True}
    elif self.path=='/api/upload':
     data=base64.b64decode(obj['base64'],validate=True)
     if len(data)>32*1024*1024:raise ValueError('图片不能超过 32 MB')
     current=lib.hole(obj['holeId']);source=next((v for v in current['versions'] if v['id']==obj.get('basedOn')),None)
     refs=source['references'] if source else []
     vid,created=lib.version(obj['holeId'],data,obj['filename'],obj.get('title') or '新修订',obj.get('note',''),obj.get('prompt',''),{'source':'user_upload','basedOn':source['id'] if source else None,'reviewStatus':'待核对'},refs)
     result={'ok':True,'versionId':vid,'created':created}
    elif self.path=='/api/backup':result={'ok':True,'path':str(lib.backup())}
    else:return self.send(404,{'error':'操作不存在'})
    self.send(200,result)
   finally:lib.close()
  except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)})

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--port',type=int,default=8769);ap.add_argument('--db',default=str(DB));ap.add_argument('--open',action='store_true');a=ap.parse_args()
 server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);server.db_path=a.db
 url=f'http://127.0.0.1:{a.port}/';print('球道图库已启动：'+url,flush=True)
 if a.open:threading.Timer(.5,lambda:webbrowser.open(url)).start()
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
