import pathlib,json,math,urllib.request,urllib.parse,concurrent.futures
root=pathlib.Path(__file__).resolve().parents[2];out=root/'outputs/shanghai-five-gps'
def xy(lon,lat):return [lon*20037508.342789244/180,math.log(math.tan((90+lat)*math.pi/360))*6378137]
def fetch(d):
 if (d/'satellite.jpg').exists():return d.name,'cached'
 fs=json.loads((d/'features.geojson').read_text())['features'];ps=next(f for f in fs if f['properties'].get('leisure')=='golf_course')['geometry']['coordinates'][0]
 a=xy(min(p[0] for p in ps)-.0005,min(p[1] for p in ps)-.0005);b=xy(max(p[0] for p in ps)+.0005,max(p[1] for p in ps)+.0005);w,h=b[0]-a[0],b[1]-a[1];size=[round(2048*w/max(w,h)),round(2048*h/max(w,h))]
 params={'bbox':','.join(map(str,a+b)),'bboxSR':3857,'imageSR':3857,'size':','.join(map(str,size)),'format':'jpg','f':'json'}
 for host in ['server.arcgisonline.com','services.arcgisonline.com']:
  try:
   u='https://'+host+'/ArcGIS/rest/services/World_Imagery/MapServer/export?'+urllib.parse.urlencode(params);data=json.load(urllib.request.urlopen(u,timeout=40));(d/'imagery.json').write_text(json.dumps(dict(data,requestUrl=u,retrievedOn='2026-10-30'),indent=2));(d/'satellite.jpg').write_bytes(urllib.request.urlopen(data['href'],timeout=40).read());return d.name,size
  except Exception as e:print(d.name,host,repr(e),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 for r in ex.map(fetch,[d for d in out.iterdir() if d.is_dir() and (d/'features.geojson').exists()]):print(r,flush=True)
