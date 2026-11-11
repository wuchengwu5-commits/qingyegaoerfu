"""Build north-up per-hole JPEGs and native map data from WGS84 registration."""
import io,json,hashlib,math
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2];app=root/'qingye-miniprogram'
reg=json.loads((app/'data/maps/jiulongshan-gps/registration.json').read_text())
im=Image.open(root/'outputs/jiulongshan-gps/research/hq-atlas.jpg')
a=reg['atlas'];e=a['extent'];W,H=im.size;assert (W,H)==(a['width'],a['height'])
cid=reg['courseId'];catalog=next(c for c in json.loads((root/'shared-golf/courses.json').read_text())['courses'] if c['id']==cid)
pars={h['id']:h['par'] for s in catalog['segments'] for h in s['holes']}
m=json.loads((app/'cloud-assets/hole-reference-v1/manifest.json').read_text())
cloud=m['overview']['fileID'].split('/hole-reference-v1/')[0]
out=app/'cloud-assets/hole-gps-v1';(out/cid).mkdir(parents=True,exist_ok=True)
def pixel(p):return [(p[0]-e['xmin'])/(e['xmax']-e['xmin'])*W,(e['ymax']-p[1])/(e['ymax']-e['ymin'])*H]
def geo(x,y):return [e['xmin']+x/W*(e['xmax']-e['xmin']),e['ymax']-y/H*(e['ymax']-e['ymin'])]
native={};assets=[]
for i,h in enumerate(reg['holes'],1):
 hid=h['id'];route=[pixel(p) for p in h['route']];green=[pixel(p) for p in h['green']];pts=route+green
 # Buffer sizes in source pixels; notably smaller on the parallel A / B closing holes.
 radius=(18 if h['label'] in ['A1','A2','A8','A9','B1','B9'] else 22)*3
 margin=radius+24;x=math.floor(min(p[0] for p in pts)-margin);y=math.floor(min(p[1] for p in pts)-margin);r=math.ceil(max(p[0] for p in pts)+margin);b=math.ceil(max(p[1] for p in pts)+margin)
 assert 0<=x<r<=W and 0<=y<b<=H
 w,hh=r-x,b-y
 local=lambda p:[round(p[0]-x,3),round(p[1]-y,3)]
 buf=io.BytesIO();im.crop((x,y,r,b)).save(buf,'JPEG',quality=91,optimize=True,subsampling=0);body=buf.getvalue();sha=hashlib.sha256(body).hexdigest()
 name=f'{cid}/{h["label"]}-{sha[:16]}.jpg';(out/name).write_bytes(body);key='hole-gps-v1/'+name
 nw=geo(x,y);se=geo(r,b);ext={'xmin':nw[0],'ymin':se[1],'xmax':se[0],'ymax':nw[1],'spatialReference':{'wkid':4326}}
 # Use the actual fairway for the default lay-up on the split island hole.
 ll=[math.hypot(q[0]-p[0],q[1]-p[1]) for p,q in zip(route,route[1:])];left=sum(ll)/2
 for j,length in enumerate(ll):
  if left<=length:
   p,q=route[j:j+2];target=[p[k]+(q[k]-p[k])*left/length for k in range(2)];break
  left-=length
 if h['label']=='B9':target=route[2]
 if pars[hid]==3:target=route[-1]
 # Round each corner of the crop with Chaikin subdivision. The survey trace
 # and the measured green stay untouched, especially on the two island holes.
 smooth=route
 for _ in range(3):
  mid=[]
  for u,v in zip(smooth,smooth[1:]):
   for t in (.25,.75):mid.append([u[k]+(v[k]-u[k])*t for k in (0,1)])
  smooth=[smooth[0],*mid,smooth[-1]]
 smooth=[smooth[0]]+[v for j,v in enumerate(smooth[1:-1],1) if math.dist(v,smooth[j-1])>2.0]+[smooth[-1]]
 native[hid]=dict(id=hid,number=i,courseId=cid,par=pars[hid],width=w,height=hh,extent=ext,satelliteOnly=True,satelliteImage=cloud+'/'+key,defaultOrigin=local(route[0]),defaultTarget=local(target),greenCenter=local(route[-1]),features=[{'id':'green','kind':'green','points':list(map(local,green))}],focusRoute=list(map(local,smooth)),directApproach=pars[hid]==3,focusRadius=radius,focusSolidBuffer=0,focusFeather=8,edgeFeather=3,maskStep=2,focusPaddingX=radius+10,focusPaddingY=radius+9,verified=False,status=h['status'])
 assets.append(dict(id=hid,label=h['label'],width=w,height=hh,bytes=len(body),sha256=sha,cloudPath=key,fileID=cloud+'/'+key,localFile=str((out/name).relative_to(root)),sourceWindow=[x,y,r,b],extent=ext))
assert len(assets)==len(pars)==len(native)==27 and set(pars)==set(native)
# Store geographic control points alongside the cloud image and its true bounds.
# The renderer alone uses pixel coordinates. Editing the GPS points here or in
# the database changes measurement without having to rebuild the application.
records=[]
for hole in reg['holes']:
 data=native[hole['id']].copy()
 extent=data['extent']
 target=data.pop('defaultTarget')
 target_geo=[extent['xmin']+target[0]/data['width']*(extent['xmax']-extent['xmin']),
             extent['ymax']-target[1]/data['height']*(extent['ymax']-extent['ymin'])]
 for key in ('defaultOrigin','greenCenter','features','satelliteOnly'):
  del data[key]
 data['_id']=data.pop('id')
 data.update(schema=1,revision=reg['version'],label=hole['label'],
             tee=hole['route'][0],target=hole['route'][-1] if data['directApproach'] else target_geo,
             green=hole['route'][-1],greenOutline=hole['green'])
 records.append(data)
dest=app/'data/maps/jiulongshan-gps/database.json'
dest.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
(out/'manifest.json').write_text(json.dumps({'courseId':cid,'registrationVersion':reg['version'],'attribution':'Esri / Vantor / GIS User Community','assets':assets},ensure_ascii=False,indent=2)+'\n')
print('Built 27 individually georeferenced GPS images:',sum(h['bytes'] for h in assets),'bytes')
