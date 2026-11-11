// Export current library versions into immutable, cloud-only app assets.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('/Users/wuchengwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'outputs/reference-map-integration-20261105');
const dir=path.join(root,'qingye-miniprogram/cloud-assets/hole-reference-v1');
const cloudRoot='cloud://cloud1-d7gketoi570d17f80.636c-cloud1-d7gketoi570d17f80-1524135194';
(async()=>{const items=JSON.parse(fs.readFileSync(path.join(out,'source-manifest.json'))),assets=[];
 for(const item of items){const data=await sharp(path.join(root,item.sourceFile)).png({palette:true,colours:256,quality:95,dither:0.5,compressionLevel:9}).toBuffer();const sha=crypto.createHash('sha256').update(data).digest('hex'),name=item.course_id+'/'+item.id+'-'+sha.slice(0,16)+'.png',dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);assets.push({...item,sourceSha256:item.sha256,sha256:sha,bytes:data.length,cloudPath:'hole-reference-v1/'+name,fileID:cloudRoot+'/hole-reference-v1/'+name,localFile:path.relative(root,dest)});}
 const overviewSource=path.join(root,'outputs/jiulongshan-27-2026-11-05/references/satellite-area.jpg');const body=fs.readFileSync(overviewSource),sha=crypto.createHash('sha256').update(body).digest('hex'),name='cn_bg_611/overview-'+sha.slice(0,16)+'.jpg',dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);
 const overview={id:'cn_bg_611_overview',course_id:'cn_bg_611',width:2048,height:2048,bytes:body.length,sha256:sha,cloudPath:'hole-reference-v1/'+name,fileID:cloudRoot+'/hole-reference-v1/'+name,localFile:path.relative(root,dest)};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),assets,overview},null,2)+'\n');console.log(JSON.stringify({artworks:assets.length,artBytes:assets.reduce((s,a)=>s+a.bytes,0),overviewBytes:body.length,minBytes:Math.min(...assets.map(a=>a.bytes)),maxBytes:Math.max(...assets.map(a=>a.bytes))}));
})().catch(e=>{console.error(e);process.exitCode=1});
