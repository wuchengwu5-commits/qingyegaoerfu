"""Bind transparent current-library art to GPS display anchors; never edit GPS geometry."""
from pathlib import Path
import json, math

root=Path(__file__).resolve().parents[2]
for source in (root/'qingye-miniprogram/data/maps').glob('*-art-overlay.json'):
    registration=json.loads(source.read_text())
    package=root/'qingye-miniprogram/miniprogram/packages'/registration['package']
    references=json.loads((package/'reference-holes.js').read_text().removeprefix('module.exports=').strip().removesuffix(';'))
    manifest={}
    for entry in registration['holes']:
        ref=references[entry['id']]
        grid=registration['coordinateSpace']
        tee=[entry['tee'][0]*ref['width']/grid['width'],entry['tee'][1]*ref['height']/grid['height']]
        green=[entry['green'][0]*ref['width']/grid['width'],entry['green'][1]*ref['height']/grid['height']]
        vx,vy=green[0]-tee[0],green[1]-tee[1]
        angle=math.atan2(vx,-vy);scale=640/math.hypot(vx,vy)
        def local(x,y):
            dx,dy=x-tee[0],y-tee[1]
            return ((dx*math.cos(angle)+dy*math.sin(angle))*scale,(-dx*math.sin(angle)+dy*math.cos(angle))*scale)
        corners=[local(x,y) for x,y in [(0,0),(ref['width'],0),(ref['width'],ref['height']),(0,ref['height'])]]
        left,top=min(p[0] for p in corners),min(p[1] for p in corners)
        frame=[left,top,max(p[0] for p in corners)-left,max(p[1] for p in corners)-top]
        manifest[entry['id']]={**{k:ref[k] for k in ('width','height','libraryVersion','sourceSha256')},'src':ref['image'],'tee':tee,'green':green,'frame':frame}
        # Bounds of non-transparent pixels in the same tee-relative coordinates.
        if entry.get('contentFrameSourceSha256')==ref['sourceSha256'] and 'contentFrame' in entry:
            manifest[entry['id']]['contentFrame']=entry['contentFrame']
    (package/'atlas-art-data.js').write_text('module.exports='+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\n')
    marker='// Registered artwork over the GPS canvas.'
    for name,extra in [('atlas-config.js','{art:require("./atlas-art-data"),artDisplayRevision:'+json.dumps(registration['revision'])+'}'),('course-config.js','{artOverlay:true}')]:
        p=package/name;s=p.read_text().split(marker)[0].rstrip()
        p.write_text(s+'\n'+marker+'\nObject.assign(module.exports,'+extra+');\n')
