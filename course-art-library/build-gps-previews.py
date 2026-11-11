"""Create north-up overview thumbnails for archived tile-only maps."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parent
manifest=root/'import-data/gps-manifests.json'
bundles=json.loads(manifest.read_text())
for bundle in bundles:
 document=bundle['document']
 if document.get('preview'):continue
 atlas=document.get('atlas');tiles=document.get('imageTiles',{}).get(document.get('atlasMedia'),{}).get('tiles',[])
 if not atlas or not tiles:continue
 image=Image.new('RGB',(atlas['width'],atlas['height']),'#dce6da')
 for tile in tiles:
  key=document['media'].get(tile['src'])
  if not key:raise ValueError('缺少卫星瓦片 '+tile['src'])
  source=Image.open(bundle['files'][key]).convert('RGB')
  x,y,w,h=tile['x'],tile['y'],tile['width'],tile['height']
  image.paste(source.crop((x-tile['left'],y-tile['top'],x-tile['left']+w,y-tile['top']+h)),(x,y))
 image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
 file=root/'import-data/gps-previews'/(document['courseId']+'.jpg');file.parent.mkdir(exist_ok=True);image.save(file,quality=92)
 document['preview']='previews/overview.jpg';bundle['files'][document['preview']]=str(file.resolve())
 print(document['courseId'],'overview thumbnail saved')
manifest.write_text(json.dumps(bundles,ensure_ascii=False,indent=2))
