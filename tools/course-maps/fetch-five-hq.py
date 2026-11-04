from pathlib import Path
import urllib.request,urllib.parse,json,concurrent.futures,time
root=Path(__file__).resolve().parents[2];out=root/'outputs/satellite-quality-2026-11-02'
def fetch(slug):
 d=out/slug;d.mkdir(exist_ok=True)
 if (d/'satellite.jpg').exists():return slug,'cached'
 old=json.loads((root/'outputs/shanghai-five-gps'/slug/'imagery.json').read_text());e=old['extent'];w,h=old['width'],old['height'];limit=3584 if slug=='links' else 4096;params={'bbox':','.join(str(e[k]) for k in ['xmin','ymin','xmax','ymax']),'bboxSR':3857,'imageSR':3857,'size':str(round(limit*w/max(w,h)))+','+str(round(limit*h/max(w,h))),'format':'jpg','f':'json'}
 for host in ['services.arcgisonline.com','server.arcgisonline.com']:
  try:
   u='https://'+host+'/ArcGIS/rest/services/World_Imagery/MapServer/export?'+urllib.parse.urlencode(params)
   data=json.load(urllib.request.urlopen(u,timeout=100))
   if 'href' not in data:raise ValueError(str(data))
   raw=urllib.request.urlopen(data['href'],timeout=100).read();(d/'satellite.jpg').write_bytes(raw);(d/'imagery.json').write_text(json.dumps(dict(data,requestUrl=u,retrievedOn='2026-11-02'),indent=2));return slug,data['width'],data['height'],len(raw)
  except Exception as ex:print(slug,host,str(ex)[:140],flush=True)
 return slug,'failed'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
 for row in ex.map(fetch,['tianma','huakai','links','meilan','qizhong']):print(row,flush=True)
