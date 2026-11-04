"""Build a browser-only UI aid from native sources. It is not a WeChat compiler."""
from pathlib import Path
import json, hashlib, re, runpy
root=Path(__file__).resolve().parent
runpy.run_path(str(root.parent/'tools/course-maps/build-template.py'))
m=root/'miniprogram';a=json.loads((m/'app.json').read_text());pages=a['pages']+[s['root']+'/'+p for s in a.get('subPackages',[]) for p in s['pages']]
x={'tabBarCSS':(m/'custom-tab-bar/index.wxss').read_text(),'tabs':a['tabBar']['list'],'globalCSS':(m/'app.wxss').read_text(),'modules':{str(p.relative_to(m))[:-3]:p.read_text() for p in m.rglob('*.js') if '/pages/' not in str(p)},'pages':{n:{'js':(m/(n+'.js')).read_text(),'wxml':(m/(n+'.wxml')).read_text(),'css':(m/(n+'.wxss')).read_text(),'navigationStyle':json.loads((m/(n+'.json')).read_text()).get('navigationStyle','default'),'title':json.loads((m/(n+'.json')).read_text()).get('navigationBarTitleText','青野')} for n in pages}}
(root/'preview/bundle.js').write_text('window.GOLF_BUNDLE='+json.dumps(x,ensure_ascii=False,separators=(',',':'))+';')
version=hashlib.sha256(b''.join((root/'preview'/name).read_bytes() for name in ['bundle.js','canvas-adapter.js','runtime.js','picker-adapter.js','picker-adapter.css'])).hexdigest()[:10]
index=root/'preview/index.html'
index.write_text(re.sub(r'src="(bundle|canvas-adapter|picker-adapter|runtime)\.js(?:\?v=[^"]*)?"',lambda m:'src="'+m[1]+'.js?v='+version+'"',index.read_text()))

index.write_text(re.sub(r'href="picker-adapter\.css(?:\?v=[^"]*)?"','href="picker-adapter.css?v='+version+'"',index.read_text()))
