"""Portable, offline geo-referenced files for future editing or field review."""
from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parents[2];app=root/'qingye-miniprogram';out=root/'outputs/jiulongshan-gps'
reg=json.loads((app/'data/maps/jiulongshan-gps/registration.json').read_text());manifest=json.loads((app/'cloud-assets/hole-gps-v1/manifest.json').read_text());assets={a['id']:a for a in manifest['assets']}
readme='九龙山 A 海景、B 湖景、C 采石 27 洞。每洞含正北向卫星 JPG、配套 JGW 地理定位文件与 PRJ 坐标系。将三个同名文件放在一起可在 GIS 软件中打开。逐洞要素.geojson 包含参考起点、球道走向、果岭轮廓及中心。坐标为经度、纬度 WGS84。影像：Esri / Vantor / GIS User Community；获取日期 2026-11-05，拍摄日期未知。位置按卫星影像判读，与百高逐洞导览交叉对照，未经球会或现场实测；不代表当天旗位。'
wkt='GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]'
features=[]
with zipfile.ZipFile(out/'九龙山27洞-GPS地图.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
 z.writestr('使用说明.txt',readme)
 for h in reg['holes']:
  a=assets[h['id']];l=h['label'];key=l[0]+'/'+l;e=a['extent'];dx=(e['xmax']-e['xmin'])/a['width'];dy=(e['ymin']-e['ymax'])/a['height']
  z.write(root/a['localFile'],key+'.jpg');z.writestr(key+'.jgw','\n'.join(f'{v:.14f}' for v in [dx,0,0,dy,e['xmin']+dx/2,e['ymax']+dy/2])+'\n');z.writestr(key+'.prj',wkt)
  for t,g,c in [('参考起点','Point',h['route'][0]),('球道走向','LineString',h['route']),('果岭轮廓','Polygon',[h['green']+[h['green'][0]]]),('果岭中心','Point',h['route'][-1])]:
   features.append({'type':'Feature','properties':{'id':h['id'],'hole':l,'type':t,'verified':False},'geometry':{'type':g,'coordinates':c}})
 z.writestr('逐洞要素.geojson',json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False))
