"""Emit the shared continuous GPS page into independent course subpackages."""
from pathlib import Path
import shutil,json
root=Path(__file__).resolve().parents[2]
import runpy,subprocess,sys
subprocess.run([sys.executable,str(root/'tools/gps-atlas/build-levels.py')],check=True)
runpy.run_path(str(root/'tools/gps-atlas/build-art-overlays.py'))
shutil.copy2(root/'templates/gps-atlas/atlas-raster.js',root/'qingye-miniprogram/miniprogram/packages/tianma-map/raster-image.js')
f=root/'qingye-miniprogram/miniprogram/packages/tianma-map/raster-image.js';f.write_text(f.read_text().replace("require('./atlas-tiles')","require('./image-tiles')"))
# Tianma's mobile control layout is the standard for continuous GPS maps.
for name in ['atlas-background.js','atlas-viewport.js','atlas-stream.js']:
 shutil.copy2(root/'templates/map-ui'/name,root/'templates/gps-atlas'/name)
 shutil.copy2(root/'templates/map-ui'/name,root/'qingye-miniprogram/miniprogram/packages/tianma-map'/name)
shutil.copy2(root/'templates/map-ui/atlas-hud.js',root/'templates/gps-atlas/atlas-hud.js')
shutil.copy2(root/'templates/map-ui/atlas-hud.js',root/'qingye-miniprogram/miniprogram/packages/tianma-map/atlas-hud.js')
tianma_camera=(root/'templates/gps-atlas/atlas-camera.js').read_text()
tianma_camera=tianma_camera.replace("const Config=require('./atlas-config');\nconst atlas=Config.atlas;\nconst Boundary=require('./atlas-boundary');","const atlas=require('./overview-data');")
tianma_camera=tianma_camera.replace("(holes.length?holes.flatMap(h=>[...h.route,...h.outline]):Boundary.outer)","holes.flatMap(h=>[...h.route,...h.outline])")
tianma_camera=tianma_camera.replace('Config.par3MaxScale','1.28')
(root/'qingye-miniprogram/miniprogram/packages/tianma-map/atlas-camera.js').write_text(tianma_camera)
registry=(root/'qingye-miniprogram/miniprogram/services/suzhou-gps-maps.js')
suzhou={m['package']:m['title'] for m in json.loads(registry.read_text().split('=',1)[1].strip().removesuffix(';')).values()} if registry.exists() else {}
for name in ['xubao-map','tianhong-map','qizhong-map','jiulongshan-map','hole-map','sheshan-map','links-map','huakai-map','meilan-masters-map','meilan-nicklaus-map','anting-map','tomson-map','palmbeach-map','xiehe-map','dongzhuang-links-map','dongzhuang-garden-map','anying-forest-map','anying-links-map',*suzhou]:
 dest=root/'qingye-miniprogram/miniprogram/packages'/name
 if not (dest/'atlas-config.js').exists(): continue
 if name in ['xubao-map','tianhong-map','anying-forest-map','anying-links-map']:
  for helper in ['map-core.js','location-policy.js','hole-context.js']:shutil.copy2(root/'templates/course-map'/helper,dest/helper)
 shutil.copy2(root/'templates/map-ui/gps-maps.js',dest/'gps-maps.js')
 for source in (root/'templates/gps-atlas').iterdir():
  if source.is_file():shutil.copy2(source,dest/source.name)

 for page in [dest/"atlas.json"]:
  spec=json.loads(page.read_text());spec["navigationBarTitleText"]={"qizhong-map":"上海旗忠","jiulongshan-map":"浙江九龙山","hole-map":"上海银涛","sheshan-map":"上海佘山","links-map":"上海林克司","huakai-map":"上海华凯","meilan-masters-map":"美兰湖名人赛","meilan-nicklaus-map":"美兰湖尼克劳斯","xubao-map":"上海旭宝","tianhong-map":"上海新天鸿名人","anting-map":"颖奕安亭","tomson-map":"汤臣","palmbeach-map":"棕榈滩海景","xiehe-map":"协和","dongzhuang-links-map":"东庄海岸林克斯","dongzhuang-garden-map":"东庄园景","anying-forest-map":"PGA安瀛 · 森林场","anying-links-map":"PGA安瀛 · 长江林克斯"}.get(name,suzhou.get(name))+" · 球场地图";page.write_text(json.dumps(spec,ensure_ascii=False))

 if name in ["xubao-map","tianhong-map","anting-map","tomson-map","palmbeach-map","xiehe-map","dongzhuang-links-map","dongzhuang-garden-map"]:
  for ext in ["js","wxml","wxss","json"]:shutil.copy2(dest/("atlas."+ext),dest/("index."+ext))
