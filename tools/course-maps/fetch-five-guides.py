from pathlib import Path
import subprocess,re,json,concurrent.futures,urllib.request,urllib.parse
root=Path(__file__).resolve().parents[2];out=root/'outputs/shanghai-five-gps'
targets=[('huakai',565),('links',567),('meilan-masters',569),('meilan-nicklaus',9127),('qizhong',571),('tianma',577)]
def fetch(row):
 slug,cid=row;d=out/slug;d.mkdir(exist_ok=True);p=d/'baigolf-mobile.html';u=f'https://w.baigolf.com/course.php?act=detail&golf_course_id={cid}&lan=zh_cn'
 if not p.exists():subprocess.run(['curl','-fsSL','--retry','2','--connect-timeout','8','--max-time','30',u,'-o',str(p)],check=True)
 s=p.read_text();m=re.search(r'var courseData\s*=\s*({.*?});',s,re.S);v=json.loads(m.group(1));items=v.get('ball_path_img_list',[])
 (d/'guide-source.json').write_text(json.dumps(dict(sourceUrl=u,retrievedOn='2026-10-30',courseName=v['course_name'],images=items),ensure_ascii=False,indent=2))
 print(slug,len(items),[i.get('images_title') for i in items],flush=True)
 for i,item in enumerate(items):
  p=d/f'guide-{i+1:02}.jpg'
  if not p.exists():subprocess.run(['curl','-fsSL','--retry','1','--connect-timeout','8','--max-time','20',item['images_url'],'-o',str(p)],check=True)
 return slug
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 for f in ex.map(fetch,targets):print('Done',f,flush=True)

# Corrections verified from image headings; never relabel a mismatched hole.
for slug,name,url in [
 ('tianma','corrected-tianma-03.jpg','https://p7.itc.cn/q_70/images03/20230306/6a3ee0a4adcc4c6b93cf974c458cea89.jpeg'),
 ('huakai','corrected-huakai-10.jpg','https://i3.sinaimg.cn/ty/golf/p/2010-04-07/U2329P6T12D4925530F44DT20100407074117.jpg')
]:
 p=out/slug/name
 if not p.exists():subprocess.run(['curl','-fsSL','--connect-timeout','8','--max-time','25',url,'-o',str(p)],check=True)

# Qizhong source images are small; retain the original PNG resolution.
p=out/'qizhong';source=json.loads((p/'guide-source.json').read_text())
for i,item in enumerate(source['images']):
 dest=p/f'original-{i+1:02}.png'
 if not dest.exists():subprocess.run(['curl','-fsSL','--connect-timeout','8','--max-time','20',item['images_url'].split('?')[0],'-o',str(dest)],check=True)
