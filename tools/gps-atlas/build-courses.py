"""Build continuous GPS atlases from registered Qingye hole geometry."""
from pathlib import Path
import json,math,hashlib,argparse
from PIL import Image
root=Path(__file__).resolve().parents[2]
work=root/'outputs/qizhong-jiulongshan-atlas'
app=root/'qingye-miniprogram'
records=json.loads((work/'geography.json').read_text())
parser=argparse.ArgumentParser()
parser.add_argument('--course',choices=list(records))
selected=parser.parse_args().course
def write_js(p,value):p.write_text('module.exports='+json.dumps(value,ensure_ascii=False,separators=(',',':'))+';\n')
def merc(p):return [6378137*math.radians(p[0]),6378137*math.log(math.tan(math.pi/4+math.radians(p[1])/2))]
def pixel(p,a):
 x,y=merc(p);e=a['extent']
 return [(x-e['xmin'])/(e['xmax']-e['xmin'])*a['width'],(e['ymax']-y)/(e['ymax']-e['ymin'])*a['height']]
qizhong=[[91,206],[177,203],[258,213],[360,200],[493,181],[625,160],[741,122],[815,99],[893,57],[977,30],[1076,27],[1123,53],[1158,143],[1172,205],[1152,233],[1100,260],[1078,309],[1072,389],[1073,491],[1083,591],[1098,694],[1094,761],[1069,798],[1024,808],[971,826],[921,851],[866,880],[805,908],[753,918],[703,933],[643,956],[585,981],[523,1000],[464,1014],[401,1027],[335,1044],[281,1045],[248,1034],[223,1006],[207,959],[194,903],[180,843],[164,787],[151,726],[145,665],[137,613],[126,565],[106,514],[91,474],[86,413],[84,349],[84,289],[79,248]]
jiulongshan=[[747,177],[794,164],[835,161],[879,158],[926,149],[963,149],[990,161],[1002,193],[997,229],[1003,267],[1023,306],[1021,337],[996,355],[960,362],[934,373],[916,395],[916,440],[932,470],[929,514],[904,535],[865,549],[819,569],[783,581],[765,604],[752,633],[712,659],[658,675],[609,693],[580,711],[564,753],[559,795],[554,820],[568,836],[595,860],[615,890],[649,896],[699,889],[733,875],[753,890],[769,923],[775,957],[764,978],[735,983],[703,976],[668,963],[635,955],[600,976],[571,991],[536,986],[495,981],[460,997],[422,1007],[397,992],[396,958],[407,932],[431,918],[459,898],[475,877],[471,852],[452,830],[423,810],[398,791],[397,830],[384,872],[370,895],[343,894],[310,875],[275,860],[230,855],[190,850],[175,824],[180,785],[201,753],[232,738],[269,722],[301,705],[312,682],[337,657],[369,636],[407,612],[455,594],[481,583],[494,559],[501,531],[514,502],[537,484],[560,481],[591,491],[615,472],[609,447],[603,422],[618,402],[638,384],[655,353],[669,317],[683,283],[703,245],[725,209]]
for key,item in records.items():
 if selected and key!=selected:continue
 pack=app/'miniprogram/packages'/f'{key}-map';media=app/'cloud-assets/media-v1/packages'/f'{key}-map';media.mkdir(exist_ok=True,parents=True)
 data=app/'data/maps'/f'{key}-atlas';data.mkdir(parents=True,exist_ok=True)
 if key=='qizhong':
  atlas=item['atlas'];photo='/packages/qizhong-map/course-overview.jpg';manifest=None
 else:
  old=item['atlas']['extent'];p0=merc([old['xmin'],old['ymin']]);p1=merc([old['xmax'],old['ymax']]);width=round(6144*(p1[0]-p0[0])/(p1[1]-p0[1]));height=6144
  atlas={'width':width,'height':height,'extent':dict(xmin=p0[0],ymin=p0[1],xmax=p1[0],ymax=p1[1],spatialReference={'wkid':3857}),'northUp':True,'source':'Esri / Vantor / GIS User Community','retrievedOn':'2026-11-05'}
  photo='/packages/jiulongshan-map/atlas-overview.jpg'
  original=Image.open(root/'outputs/jiulongshan-gps/research/hq-atlas.jpg').convert('RGB')
  mesh=[]
  for y in range(0,height,16):
   b=min(height,y+16)
   def sy(v):
    ym=p1[1]-v/height*(p1[1]-p0[1]);lat=math.degrees(2*math.atan(math.exp(ym/6378137))-math.pi/2)
    return (old['ymax']-lat)/(old['ymax']-old['ymin'])*original.height
   t0,t1=sy(y),sy(b)
   mesh.append(((0,y,width,b),(0,t0,0,t1,original.width,t1,original.width,t0)))
  image=original.transform((width,height),Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
  image.save(data/'satellite-3857.jpg',quality=92)
  tiles=[]
  for y in range(0,height,1024):
   for x in range(0,width,1024):
    left,top=max(0,x-16),max(0,y-16);right,bottom=min(width,x+1040),min(height,y+1040)
    tile=image.crop((left,top,right,bottom));relative=f'atlas-tiles/{x}-{y}.jpg';target=media/relative;target.parent.mkdir(exist_ok=True);tile.save(target,quality=91)
    tiles.append(dict(src=f'/packages/{key}-map/'+relative,x=x,y=y,width=min(1024,width-x),height=min(1024,height-y),left=left,top=top))
  manifest={photo:dict(width=width,height=height,tiles=tiles)}
 extent=atlas['extent']
 outline=qizhong if key=='qizhong' else jiulongshan
 boundary={'outer':[],'exclusions':[]}
 # Inspection grids use original image proportions. Qizhong is already projected.
 if key=='qizhong':boundary['outer']=[[x*atlas['width']/1200,y*atlas['width']/1200] for x,y in outline]
 else:
  old=item['atlas']['extent'];boundary['outer']=[pixel([old['xmin']+x/1200*(old['xmax']-old['xmin']),old['ymax']-y/1200*(old['ymax']-old['ymin'])],atlas) for x,y in outline]
 reviewPath=data/'tee-review.json'
 review=json.loads(reviewPath.read_text()) if reviewPath.exists() else None
 teeReviews={h['id']:h for h in review['holes']} if review else {}
 rows=[]
 for r in item['rows']:
  n=r['number'];section=(n-1)//9;local=(n-1)%9+1
  row={k:r[k] for k in ['_id','number','par','tee','target','green','greenOutline','route']}
  teeReview=teeReviews.get(r['_id'])
  if teeReview:
   row['tee']=teeReview['tee']
   row['teeOutline']=teeReview['teeOutline']
   row['route']=[row['tee'],*r['route'][1:]]
  if r['par']==3:row['target']=r['green']
  row.update(courseId=item['courseId'],schema=2,sectionId=f"{item['courseId']}_s{section+1}",holeNumber=local,revision='continuous-atlas-20261105.1',atlas=photo,crs='EPSG:4326',verified=False,status='satellite_interpretation_draft')
  if review:row['revision']=review['revision']
  rows.append(row)
 (data/'database.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));(data/'atlas.json').write_text(json.dumps(atlas,indent=2));(data/'boundary.json').write_text(json.dumps(boundary,indent=2))
 names=['前九','后九'] if key=='qizhong' else ['A 海景场','B 湖景场','C 采石场']
 shorts=['',''] if key=='qizhong' else ['A','B','C']
 groups=[dict(id=f"{item['courseId']}_s{i+1}",name=name,short=shorts[i],color=['#204c37','#265570','#85562f'][i]) for i,name in enumerate(names)]
 context=json.loads((work/f'{key}-surround.json').read_text());ce=context['extent'];bounds=[(ce['xmin']-extent['xmin'])/(extent['xmax']-extent['xmin'])*atlas['width'],(extent['ymax']-ce['ymax'])/(extent['ymax']-extent['ymin'])*atlas['height'],(ce['xmax']-extent['xmin'])/(extent['xmax']-extent['xmin'])*atlas['width'],(extent['ymax']-ce['ymin'])/(extent['ymax']-extent['ymin'])*atlas['height']]
 raw=(work/f'{key}-surround.jpg').read_bytes();name='atlas-surround-'+hashlib.sha256(raw).hexdigest()[:16]+'.jpg';(media/name).write_bytes(raw)
 mpp=(extent['xmax']-extent['xmin'])/atlas['width']*math.cos(math.radians(rows[0]['green'][1]));par3limit=min(1.28,1.28*mpp/.592)
 config=dict(courseId=item['courseId'],name='上海旗忠' if key=='qizhong' else '浙江九龙山',atlas=atlas,photo=photo,surround=dict(src=f'/packages/{key}-map/'+name,bounds=bounds),groups=groups,par3MaxScale=par3limit,referenceRoute='/packages/jiulongshan-map/index' if key=='jiulongshan' else '',databaseGps=key=='jiulongshan')
 write_js(pack/'atlas-config.js',config);write_js(pack/'atlas-catalog.js',rows);write_js(pack/'atlas-boundary.js',boundary)
 if manifest:write_js(pack/'atlas-tiles.js',manifest)
 else:(pack/'atlas-tiles.js').write_text("module.exports=require('./image-tiles');\n")
 (data/'sources.json').write_text(json.dumps(dict(originalRegistration='outputs/qizhong-single-hole/registration.json' if key=='qizhong' else 'qingye-miniprogram/data/maps/jiulongshan-gps/registration.json',satellite='outputs/satellite-quality-2026-11-02/qizhong/imagery.json' if key=='qizhong' else 'outputs/jiulongshan-gps/research/hq-atlas.jpg',projection='EPSG:3857',boundaryPurpose='cartographic display, not property boundary',surround=context,referenceTee='satellite interpretation',flag='green center reference, not daily pin'),ensure_ascii=False,indent=2))
 print(key,len(rows),atlas['width'],atlas['height'],'par3',par3limit)
