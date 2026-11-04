import pathlib,urllib.request,urllib.parse,concurrent.futures,re,json,time
out=pathlib.Path(__file__).resolve().parents[2]/'outputs/shanghai-five-gps'
targets=[('huakai','Shanghai Sino-Bay Country Sports Club','CHINA',18),('meilan-masters','Lake Malaren Golf Club, Masters','CHINA',18),('meilan-forest','Lake Malaren Golf Club, Forest','201908',18),('qizhong','Shanghai Qizhong Golf Club','201111',18),('links','Shanghai Links Golf Club','201201',18),('tianma-old','Tianma Golf & Country Club, Old','201603',9),('tianma-new','Tianma Golf & Country Club, New','201603',9),('tianma-tianma','Tianma Golf & Country Club, Tianma','201603',9)]
def f(item):
 slug,name,z,n=item;d=out/'traxx'/slug;d.mkdir(parents=True,exist_ok=True);p=d/f'{n:02}.html';u='https://golftraxx.com/moving?'+urllib.parse.urlencode({'coursename':name,'hole':n,'static':'true','zipcode':z})
 if not p.exists():p.write_bytes(urllib.request.urlopen(u,timeout=30).read())
 text=p.read_text();vals={k:float(v) for k,v in re.findall(r'var (ttlatitude|ttlongitude|gflatitude|gflongitude|gclatitude|gclongitude|gblatitude|gblongitude) = "([\d.\-]+)"',text)}
 return dict(slug=slug,hole=n,sourceUrl=u,**vals)
items=[(s,n,z,h) for s,n,z,count in targets for h in range(1,count+1)];result=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 for i,task in enumerate(ex.map(f,items)):
  result.append(task)
  if i%9==8:print('Coordinates',i+1,flush=True)
(out/'traxx/points.json').write_text(json.dumps(result,indent=2))
