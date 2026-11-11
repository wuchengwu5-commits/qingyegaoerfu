"""Archive GPS sources beside, rather than replacing, the selected artwork."""
import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'course-art-library'))
from library import Library
app=root/'qingye-miniprogram';reg=json.loads((app/'data/maps/jiulongshan-gps/registration.json').read_text());manifest=json.loads((app/'cloud-assets/hole-gps-v1/manifest.json').read_text());files={a['id']:a for a in manifest['assets']};cid=reg['courseId'];lib=Library()
out=root/'course-art-library/import-data/jiulongshan-gps';out.mkdir(exist_ok=True)
try:
 for h in reg['holes']:
  a=files[h['id']];p=out/(h['label']+'-GPS.json');p.write_text(json.dumps({'crs':reg['crs'],'version':reg['version'],'method':reg['method'],'geography':h,'imageExtent':a['extent'],'imageSha256':a['sha256'],'imageSize':[a['width'],a['height']]},ensure_ascii=False,indent=2)+'\n')
  meta={'label':h['label'],'version':reg['version'],'verified':False,'width':a['width'],'height':a['height'],'note':reg['method']}
  lib.reference(cid,h['id'],p,'gps',reg['sources']['holeGuide'],meta)
  lib.reference(cid,h['id'],root/a['localFile'],'satellite',reg['sources']['satellite'],meta)
 print('Archived GPS geometry and satellite JPEG for all',len(reg['holes']),'physical holes.')
finally:lib.close()
