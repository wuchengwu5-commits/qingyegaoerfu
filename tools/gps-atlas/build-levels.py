"""Create small, geographically identical first-paint images from existing tiles.
No geometry, extents or original high-resolution media are changed.
"""
from pathlib import Path
import json,hashlib,subprocess,io
try:
 from PIL import Image
except ModuleNotFoundError:
 import os,sys
 runtime=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
 if str(runtime)==sys.executable:raise
 os.execv(str(runtime),[str(runtime),__file__])
root=Path(__file__).resolve().parents[2];packages=root/'qingye-miniprogram/miniprogram/packages';media=root/'qingye-miniprogram/cloud-assets/media-v1';node='/Users/wuchengwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
def module(f):return json.loads(subprocess.check_output([node,'-e','process.stdout.write(JSON.stringify(require(process.argv[1])))',str(f)]))
def asset(im,key,kind,max_size,quality=82):
 im.thumbnail((max_size,max_size),Image.Resampling.LANCZOS);buffer=io.BytesIO();im.save(buffer,format='JPEG',quality=quality,optimize=True);data=buffer.getvalue();sha=hashlib.sha256(data).hexdigest();src='/packages/'+key+'/'+kind+'-'+sha[:16]+'.jpg';f=media/src.lstrip('/');f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data);return dict(src=src,width=im.width,height=im.height,sha256=sha,bytes=len(data))

for d in sorted(packages.iterdir()):
 if d.name=='tianma-map':cfg=dict(atlas=module(d/'overview-data.js'),photo=module(d/'course-config.js')['atlas'],surround=module(d/'atlas-context.js'));manifest=module(d/'image-tiles.js')
 elif (d/'atlas-config.js').exists():cfg=module(d/'atlas-config.js');manifest=module(d/'atlas-tiles.js')
 else:continue
 m=manifest[cfg['photo']];surround=cfg['surround'];signature=hashlib.sha256(json.dumps([m,surround['src'],1536,1280,82],sort_keys=True).encode()).hexdigest();target=d/'atlas-levels.js'
 if target.exists():
  old=module(target)
  if old.get('signature')==signature and sum(old[k]['bytes'] for k in ['overview','surround'])<1200000 and all((media/old[k]['src'].lstrip('/')).exists() for k in ['overview','surround']):continue
 im=Image.new('RGB',(m['width'],m['height']))
 for t in m['tiles']:
  tile=Image.open(media/t['src'].lstrip('/'));left=t['x']-t['left'];top=t['y']-t['top'];im.paste(tile.crop((left,top,left+t['width'],top+t['height'])),(t['x'],t['y']))
 context_image=Image.open(media/surround['src'].lstrip('/')).convert('RGB')
 overview=asset(im,d.name,'overview-fast',1536);context=asset(context_image,d.name,'surround-fast',1280)
 if overview['bytes']+context['bytes']>=1200000:
  overview=asset(im,d.name,'overview-fast',1360,76);context=asset(context_image,d.name,'surround-fast',1080,76)
 levels=dict(signature=signature,atlas=cfg['photo'],overview=overview,surround=context,sourceSurround=surround['src'],revision='progressive-20261107.1');target.write_text('module.exports='+json.dumps(levels,separators=(',',':'))+';\n');print(d.name,overview['bytes']+context['bytes'],'first-paint bytes',flush=True)
