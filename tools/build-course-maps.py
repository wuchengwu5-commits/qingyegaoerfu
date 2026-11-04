"""Copy the provided original maps, preserving their source and stable hole IDs."""
from pathlib import Path
import hashlib
import json
import shutil

root=Path(__file__).resolve().parents[1]
source=root/'outputs/银涛球场地图样张_2026-10-20'
dist=root/'golf-h5/dist'
folder=dist/'assets/maps/cn_bg_585'
folder.mkdir(parents=True,exist_ok=True)
index=json.loads((source/'地图索引.json').read_text())
origins=json.loads((source/'图片来源.json').read_text())
items=[]
for origin in origins:
    if origin.get('status')!='downloaded':continue
    path=source/origin['file']
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    if digest!=origin['sha256']:raise ValueError('Source map checksum mismatch: '+str(path))
    hole=origin.get('hole')
    hole_info=next((h for h in index['holes'] if h['hole_number']==hole),None)
    name=('hole-'+str(hole).zfill(2) if hole else origin['id'])+path.suffix.lower()
    shutil.copyfile(path,folder/name)
    items.append(dict(id='seed-yintao-'+origin['id'],courseId='cn_bg_585',kind='hole' if hole else 'overview',holeId=hole_info['hole_id'] if hole_info else None,label=hole_info['source_label'] if hole_info else ('历史总览（2009）' if origin['id']=='overview_sina' else '总览（转载图）'),url='assets/maps/cn_bg_585/'+name,sourceUrl=origin['source_page'],sourcePublishedOn=origin.get('published_on'),effectiveOn=None,verified=False,active=True,sha256=digest,origin='project_reference',note='来源原图，现行布局未由球会确认；图上码数不覆盖本轮记分卡。',updatedAt=0))
data=dict(version=1,items=items)
(dist/'course-maps.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
(dist/'maps-data.js').write_text('globalThis.GolfMapSeed='+json.dumps(data,ensure_ascii=False)+';\n')
print('Imported',len(items),'original maps, including',sum(i['kind']=='hole' for i in items),'holes')
