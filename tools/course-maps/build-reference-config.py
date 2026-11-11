"""Bind reviewed library versions to stable source hole IDs, without inventing GPS."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
base=root/'qingye-miniprogram/miniprogram/packages'
m=json.loads((root/'qingye-miniprogram/cloud-assets/hole-reference-v1/manifest.json').read_text())
for cid,name in [('cn_bg_585','hole-map'),('cn_bg_611','jiulongshan-map')]:
 dest=base/name;dest.mkdir(exist_ok=True)
 refs={a['id']:{'id':a['id'],'courseId':cid,'number':a['ordinal'],'diagram':True,'reference':True,'width':a['width'],'height':a['height'],'image':a['fileID'],'defaultOrigin':[a['width']/2,a['height']*.9],'defaultTarget':[a['width']/2,a['height']/2],'libraryVersion':a['version_id'],'sourceSha256':a['sourceSha256']} for a in m['assets'] if a['course_id']==cid}
 (dest/'reference-holes.js').write_text('module.exports='+json.dumps(refs,ensure_ascii=False,separators=(',',':'))+';\n')
note='按球道资料和卫星参考重绘的美术参考图，球道、果岭、沙坑、水域和树木采用立体卡通表达。存在艺术化偏差，不用于 GPS 定位或测距；需要测距时请切换 GPS 图。图片无发球台标记点。'
p=base/'hole-map/course-config.js';s=p.read_text();marker='// Library-backed reference artwork.'
if marker in s:s=s.split(marker)[0]
s+=marker+'\nObject.assign(module.exports,{references:require("./reference-holes"),referenceNote:'+json.dumps(note,ensure_ascii=False)+',availabilityNote:"18 洞参考图与 GPS 图已开放"});\n';p.write_text(s)
# The source export is explicitly in EPSG:4326. Preserve its linear lon/lat grid.
overview={'width':2048,'height':2048,'extent':{'xmin':121.105,'ymin':30.5905,'xmax':121.143,'ymax':30.6285,'spatialReference':{'wkid':4326}},'frame':{'x':0,'y':0,'width':2048,'height':2048},'northUp':True,'fillViewport':False,'maxZoom':8,'verified':False}
dest=base/'jiulongshan-map';(dest/'overview-data.js').write_text('module.exports='+json.dumps(overview,separators=(',',':'))+';\n');(dest/'image-tiles.js').write_text('module.exports={};\n')
config={'shortName':'浙江九龙山','courseId':'cn_bg_611','route':'/packages/jiulongshan-map/index','assetRoot':'/packages/jiulongshan-map','photo':None,'atlas':m['overview']['fileID'],'pendingSatellite':False,'sectionNames':{'cn_bg_611_s1':'A 海景场','cn_bg_611_s2':'B 湖景场','cn_bg_611_s3':'C 采石场'},
    'availabilityNote':'A、B、C 场共 27 洞 · 参考图和 GPS 图均已开放','attribution':'Esri / Vantor / GIS User Community','overviewAttribution':'Esri / Vantor / GIS User Community',
    'overviewNote':'九龙山全场 GPS 卫星图。查看三个九洞场的相对位置；逐洞测距请选对应洞号。允许缩放、拖动和显示当前位置；右上角可返回所选球洞的参考图。影像获取日期 2026-11-05，不代表拍摄日期。',
    'mapNote':'九龙山逐洞 GPS 卫星图。洞号和走向参考百高逐洞导览，发球区和果岭轮廓按卫星影像判读，尚未现场校准。参考起点不是当天 Tee 标志，果岭中心不是当天旗位；测距为水平直线估算。',
    'referenceNote':note+' 九龙山依据百高公开逐洞图重绘，逐洞 GPS 另用卫星影像制作。'}
(dest/'course-config.js').write_text('const overview=require("./overview-data");\nmodule.exports={...'+json.dumps(config,ensure_ascii=False,separators=(',',':'))+',databaseGps:true,holes:{},references:require("./reference-holes"),overview,defaultMap:{...overview,defaultOrigin:[1024,1024],defaultTarget:[1024,1024]}};\n')
print('Bound 45 reference images; Jiulongshan retains 27 satellite holes and a separate overview.')
