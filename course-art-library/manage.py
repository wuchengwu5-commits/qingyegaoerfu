import argparse,json
from pathlib import Path
from library import Library
ap=argparse.ArgumentParser(description='球道图库的导出、版本导入和备份');sub=ap.add_subparsers(dest='cmd',required=True)
p=sub.add_parser('export-hole');p.add_argument('hole_id');p.add_argument('--to',required=True)
p=sub.add_parser('add-version');p.add_argument('hole_id');p.add_argument('--file',required=True);p.add_argument('--title',required=True);p.add_argument('--note',default='');p.add_argument('--prompt');p.add_argument('--based-on')
p=sub.add_parser('list');p.add_argument('--course')
p=sub.add_parser('export-gps');p.add_argument('course_id');p.add_argument('--to',required=True);p.add_argument('--version')
p=sub.add_parser('save-gps');p.add_argument('--file',required=True);p.add_argument('--assets-dir',required=True);p.add_argument('--title',required=True);p.add_argument('--based-on')
p=sub.add_parser('list-gps');p.add_argument('course_id')
p=sub.add_parser('select-gps');p.add_argument('course_id');p.add_argument('version');p.add_argument('--based-on',required=True)
sub.add_parser('backup');a=ap.parse_args();lib=Library()
try:
 if a.cmd=='export-hole':
  h=lib.hole(a.hole_id);out=Path(a.to);out.mkdir(parents=True,exist_ok=True);(out/'references').mkdir(exist_ok=True)
  for r in h['references']:
   b=lib.db.execute('SELECT body,filename FROM assets WHERE sha256=?',(r['asset_sha'],)).fetchone();name=r['role']+'-'+r['id'][:10]+'-'+b['filename'];(out/'references'/name).write_bytes(b['body']);r['exportedFile']='references/'+name
  v=next((v for v in h['versions'] if v['id']==h['current']),None)
  if v:
   b=lib.db.execute('SELECT body FROM assets WHERE sha256=?',(v['asset_sha'],)).fetchone()[0];(out/'current-art.png').write_bytes(b);(out/'current-prompt.txt').write_text(v['prompt'])
  (out/'hole-record.json').write_text(json.dumps(h,ensure_ascii=False,indent=2));print(out.resolve())
 elif a.cmd=='add-version':
  h=lib.hole(a.hole_id);based=a.based_on or h['current'];v=next((v for v in h['versions'] if v['id']==based),None)
  if based and not v:raise ValueError('父版本不属于该洞')
  p=Path(a.file);vid,created=lib.version(a.hole_id,p.read_bytes(),p.name,a.title,a.note,Path(a.prompt).read_text() if a.prompt else '',{'basedOn':based,'source':'local_revision'},v['references'] if v else []);print(json.dumps({'versionId':vid,'created':created}))
 elif a.cmd=='list':print(json.dumps(lib.course(a.course) if a.course else lib.courses(),ensure_ascii=False,indent=2))
 elif a.cmd=='list-gps':print(json.dumps(lib.gps(a.course_id),ensure_ascii=False,indent=2))
 elif a.cmd=='export-gps':
  target=Path(a.to);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(lib.export_gps(a.course_id,a.version));print(target.resolve())
 elif a.cmd=='save-gps':
  document=json.loads(Path(a.file).read_text());folder=Path(a.assets_dir)
  manifest=json.loads((folder/'gps-files.json').read_text())
  files={item['path']:folder/item['path'] for item in manifest}
  for source in files.values():
   if folder.resolve() not in source.resolve().parents:raise ValueError('附件必须位于导出目录内')
  if not a.based_on:raise ValueError('修改前请 list-gps 读取当前版本，并用 --based-on 指定它')
  vid,created=lib.save_gps(document['courseId'],document,files,a.title,expected_current=a.based_on)
  print(json.dumps({'versionId':vid,'created':created}))
 elif a.cmd=='select-gps':lib.select_gps(a.course_id,a.version,a.based_on);print('GPS 当前版本已更新')
 elif a.cmd=='backup':print(lib.backup())
finally:lib.close()
