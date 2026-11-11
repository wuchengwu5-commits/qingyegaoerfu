"""Idempotent archive import. Never updates an existing version or current selection."""
from pathlib import Path
import json,re
from library import Library,ROOT,pack
PROJECT=ROOT.parent
lib=Library();lib.catalog(json.loads((PROJECT/'shared-golf/courses.json').read_text()))
cache=ROOT/'import-data';cache.mkdir(exist_ok=True)
def read(p):return Path(p).read_text() if Path(p).exists() else ''
def ref(cid,hid,p,role,url='',meta=None):
 p=Path(p)
 return lib.reference(cid,hid,p,role,url,meta) if p.exists() else None
def jsonref(cid,hid,data,name,role='gps',meta=None):
 p=cache/name;p.write_text(pack(data));return ref(cid,hid,p,role,meta=meta)
def version(hid,p,title,prompt='',note='',meta=None,refs=(),select=True):
 p=Path(p)
 return lib.version(hid,p.read_bytes(),p.name,title,note,prompt,dict(meta or {},originalPath=str(p)),[r for r in refs if r],select) if p.exists() else None

# Existing map index: preserves source URLs, dates, verification and original bytes.
maps=PROJECT/'golf-h5/dist/course-maps.json'
for m in json.loads(maps.read_text())['items']:
 ref(m['courseId'],m.get('holeId'),maps.parent/m['url'],'diagram' if m['kind']=='hole' else 'overview',m.get('sourceUrl',''),m)

# Official/secondary Sheshan map files already collected in the project.
p=PROJECT/'outputs/佘山球场地图_2026-10-24';idx=json.loads((p/'地图索引.json').read_text());ss=json.loads((p/'图片来源.json').read_text())
for s in ss:
 match=next((h for h in idx['holes'] if h['hole_number']==s.get('hole')),None)
 ref(idx['course_id'],match['hole_id'] if match else None,p/s['file'],'diagram' if match else 'overview',s.get('url',''),s)
ref(idx['course_id'],None,p/'地图索引.json','source')

# Existing map coordinates, tile images and retired source diagrams for all map-enabled courses.
for m in json.loads((cache/'project-maps.json').read_text()):
 cid=m['courseId'];jsonref(cid,None,{k:v for k,v in m.items() if k!='holes'},m['package']+'-overview.json','package')
 for hid,h in m.get('holes',{}).items():
  if lib.db.execute('SELECT 1 FROM holes WHERE id=?',(hid,)).fetchone():jsonref(cid,hid,h,hid+'-gps.json',meta={'note':m.get('mapNote'),'attribution':m.get('attribution'),'verified':False})
 media=PROJECT/'qingye-miniprogram/cloud-assets/media-v1/packages'/m['package']
 if media.exists():
  for f in media.rglob('*'):
   if f.is_file() and f.suffix.lower() in ('.jpg','.jpeg','.png','.webp') and 'icons' not in f.parts:
    ref(cid,None,f,'satellite',meta={'note':m.get('overviewNote'),'relativeAssetPath':str(f.relative_to(media)),'attribution':m.get('attribution'),'verified':False})
 retired=PROJECT/'outputs/satellite-quality-2026-11-02/retired-native-guides'/m['package'].removesuffix('-map')
 if retired.exists():
  for f in retired.glob('hole-*.*'):
   n=int(re.search(r'hole-(\d+)',f.name).group(1));h=next((h for h in lib.course(cid)['holes'] if h['ordinal']==n),None)
   if h:ref(cid,h['id'],f,'diagram',meta={'status':'historical_project_reference','verified':False})

# Yintao hole 1: keep all earlier drafts and the explicitly approved V4.
cid='cn_bg_585';hid='cn_bg_585_s1_h01'
p=PROJECT/'outputs/yintao-illustrated-v3-2026-11-04'
refs=[ref(cid,hid,p/'references/银涛1号洞-新浪2009发布图.jpg','diagram','https://sports.sina.com.cn/golf/2009-03-03/15304249949.shtml',{'sourcePublishedOn':'2009-03-03','verified':False}),ref(cid,hid,p/'references/银涛1号洞-GPS与A1对应布局.png','layout'),ref(cid,hid,p/'布局控制点.json','layout')]
history=[
 ('yintao-illustrated-2026-11-04','银涛1号洞-卡通高精图-V1.png','初版风格稿','生成提示词.txt'),
 ('yintao-illustrated-2026-11-04','银涛1号洞-卡通高精图-V2-透明底.png','透明底修订','精修提示词.txt'),
 ('yintao-illustrated-v3-2026-11-04','银涛1号洞-位置修订-中间稿.png','位置修订中间稿','位置精修提示词.txt'),
 ('yintao-illustrated-v3-2026-11-04','银涛1号洞-参照布局重绘V3-去白色标记.png','V3 去白色标记','生成提示词.txt'),
 ('yintao-illustrated-v4-2026-11-04','银涛1号洞-高精图V4-无水无标记.png','V4 无水无标记 · 用户认可','修改提示词.txt')]
for folder,file,title,prompt in history:
 p=PROJECT/'outputs'/folder;approved='V4' in title
 version(hid,p/file,title,read(p/prompt),'用户最终要求：删除远处右侧水域，所有发球台不画标记点。' if approved else '历史草稿，保留用于追溯。',{'reviewStatus':'用户认可' if approved else '历史草稿','userApproved':approved},refs)

# Yintao holes 2–18: chosen finals, earlier rejected versions, source drawings and GPS.
p=PROJECT/'deliverables/银涛2-18洞-高精球道图-20261104';manifest=json.loads((p/'manifest.json').read_text())
ref(cid,None,p/'references/sources.json','source')
for h in manifest['holes']:
 n=h['hole'];hid=f'cn_bg_585_s{1 if n<=9 else 2}_h{(n-1)%9+1:02d}'
 refs=[ref(cid,hid,p/h['diagram'],'diagram','https://w.baigolf.com/course.php?act=detail&golf_course_id=585&lan=zh_cn',{'verified':False}),ref(cid,hid,p/h['gps'],'gps')]
 old=PROJECT/'outputs/yintao-holes-02-18-v1-2026-11-04/images'/f'银涛{n:02d}号洞-高精图V1.png'
 if 'V2' in h['image']:version(hid,old,'V1 初稿',read(p/h['prompt']),'已由修订版替代',{'reviewStatus':'历史草稿'},refs)
 prompt=read(p/h['prompt']);correction=p/'prompts'/f'correction-{n:02d}.txt'
 if correction.exists():prompt+='\n\n修订提示：\n'+read(correction)
 version(hid,p/h['image'],f"{'V2' if 'V2' in h['image'] else 'V1'} 高精图",prompt,h.get('countNote','按既有逐洞图和定位数据重绘；非测绘地图。'),dict(h,reviewStatus='已视觉复核，待用户确认',userApproved=False),refs)

# Jiulongshan can be re-imported as additional holes/revisions finish.
cid='cn_bg_611';p=PROJECT/'outputs/jiulongshan-27-2026-11-05';manifest=json.loads((p/'manifest.json').read_text());sources=json.loads((p/'references/sources.json').read_text())
common=[ref(cid,None,p/'references/style-approved-yintao.png','style',meta={'note':'只用于画风，不能复制银涛洞形'}),ref(cid,None,p/'references/satellite-area.jpg','satellite','https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',json.loads((p/'references/satellite-source.json').read_text())),ref(cid,None,p/'references/sources.json','source')]
for h,s in zip(manifest['holes'],sources):
 refs=common+[ref(cid,h['holeId'],p/h['diagram'],'diagram',s['sourcePage'],s),jsonref(cid,h['holeId'],{'layout':h['layout'],'gpsStatus':h['gpsStatus'],'sourceNote':manifest['referenceNote']},h['holeId']+'-layout.json','layout')]
 selected=p/h['image'] if h.get('image') else p/'images'/f"九龙山{h['label']}-高精图V1.png"
 if selected.exists():
  for old in sorted((p/'images').glob(f"九龙山{h['label']}-高精图V*.png")):
   if old!=selected:version(h['holeId'],old,'历史绘制稿',read(p/h['prompt']),'已由修订版替代',{'reviewStatus':'历史草稿'},refs,False)
  result=version(h['holeId'],selected,selected.stem.split('-')[-1],read(p/h['prompt']),manifest['referenceNote'],dict(h,reviewStatus='已视觉复核，待用户确认' if h['status']=='visually-reviewed' else '待视觉复核',userApproved=False),refs)
  if result and h['status']=='visually-reviewed':lib.review(result[0],'已检查画面与主要布局，待用户确认',h.get('review',{}))

summary={'courses':len(lib.courses()),'holes':lib.db.execute('SELECT count(*) FROM holes').fetchone()[0],'assets':lib.db.execute('SELECT count(*) FROM assets').fetchone()[0],'references':lib.db.execute('SELECT count(*) FROM reference_files').fetchone()[0],'versions':lib.db.execute('SELECT count(*) FROM versions').fetchone()[0],'currentArtHoles':lib.db.execute('SELECT count(*) FROM current_versions').fetchone()[0],'withFiles':[c for c in lib.courses() if c['reference_count'] or c['art_count']]}
(ROOT/'入库记录.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(pack({k:v for k,v in summary.items() if k!='withFiles'}));lib.close()
