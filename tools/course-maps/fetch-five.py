"""Archive public OSM source for requested Shanghai courses. Never modifies OSM."""
import pathlib,json,urllib.request,xml.etree.ElementTree as E,collections,concurrent.futures
root=pathlib.Path(__file__).resolve().parents[2];out=root/'outputs/shanghai-five-gps'
cs=json.loads((out/'catalog.json').read_text())
names={'cn_bg_565':'huakai','cn_bg_567':'links','cn_bg_569':'meilan','cn_bg_571':'qizhong','cn_bg_577':'tianma'}
def fetch(c):
 slug=names[c['id']];d=out/slug;d.mkdir(exist_ok=True);p=d/'osm.xml'
 if not p.exists():
  lon,lat=c['longitude'],c['latitude'];u=f'https://www.openstreetmap.org/api/0.6/map?bbox={lon-.025},{lat-.018},{lon+.018},{lat+.018}'
  p.write_bytes(urllib.request.urlopen(u,timeout=50).read());(d/'source.json').write_text(json.dumps({'osmUrl':u,'retrievedOn':'2026-10-30'}))
 r=E.parse(p).getroot();ns={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])] for n in r.findall('node')};fs=[]
 for w in r.findall('way'):
  t={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
  if 'golf' not in t and t.get('leisure')!='golf_course':continue
  pts=[ns[n.attrib['ref']] for n in w.findall('nd')];fs.append({'type':'Feature','properties':dict(t,osmId=w.attrib['id'],timestamp=w.attrib.get('timestamp')),'geometry':{'type':'Polygon' if pts[0]==pts[-1] else 'LineString','coordinates':[pts] if pts[0]==pts[-1] else pts}})
 (d/'features.geojson').write_text(json.dumps({'type':'FeatureCollection','features':fs},ensure_ascii=False))
 return slug,collections.Counter(f['properties'].get('golf','course') for f in fs)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 futures=[ex.submit(fetch,c) for c in cs if c['id'] in names]
 for f in concurrent.futures.as_completed(futures):
  try:print(f.result(),flush=True)
  except Exception as e:print(repr(e),flush=True)
