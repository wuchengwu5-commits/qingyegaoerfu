const https=require('https'),zlib=require('zlib'),crypto=require('crypto');
const DIRECTIONS={n:'北风',nne:'东北偏北风',ne:'东北风',ene:'东北偏东风',e:'东风',ese:'东南偏东风',se:'东南风',sse:'东南偏南风',s:'南风',ssw:'西南偏南风',sw:'西南风',wsw:'西南偏西风',w:'西风',wnw:'西北偏西风',nw:'西北风',nnw:'西北偏北风',none:'无风',vrb:'风向不定'};
function fail(code){const e=Error(code);e.code=code;throw e;}
function authorization(env,now){
 if(env.QWEATHER_PRIVATE_KEY&&env.QWEATHER_KEY_ID&&env.QWEATHER_PROJECT_ID&&env.QWEATHER_DEVELOPER_ID){
  const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const iat=Math.floor(now/1000)-30;
  const body=part({alg:'EdDSA',kid:env.QWEATHER_KEY_ID})+'.'+part({iss:env.QWEATHER_DEVELOPER_ID,sub:env.QWEATHER_PROJECT_ID,iat,exp:iat+900});
  try{return {Authorization:'Bearer '+body+'.'+crypto.sign(null,Buffer.from(body),env.QWEATHER_PRIVATE_KEY.replace(/\\n/g,'\n')).toString('base64url')};}catch(_){return fail('CONFIG_REQUIRED');}
 }
 if(env.QWEATHER_API_KEY)return {'X-QW-Api-Key':env.QWEATHER_API_KEY};
 return fail('CONFIG_REQUIRED');
}
function endpoint(env,point){
 const host=(env.QWEATHER_HOST||'').trim().toLowerCase().replace(/^https:\/\//,'').replace(/\/$/,'');
 // Account hosts may include a region label, e.g. account.xy.qweatherapi.com.
 if(host.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+qweatherapi\.com$/.test(host))return fail('CONFIG_REQUIRED');
 return 'https://'+host+'/weather/v1/current/'+point.latitude.toFixed(2)+'/'+point.longitude.toFixed(2)+'?lang=zh';
}
function requestJSON(url,headers){return new Promise((resolve,reject)=>{
 const req=https.get(url,{headers:{...headers,'Accept-Encoding':'gzip','Accept':'application/json'}},res=>{
  if(res.statusCode!==200){res.resume();return reject(Object.assign(Error('upstream'),{code:'UPSTREAM'}));}
  let size=0;const chunks=[];
  res.on('data',chunk=>{size+=chunk.length;if(size>131072)req.destroy(Error('oversize'));else chunks.push(chunk);});
  res.on('error',reject);res.on('end',()=>{try{const bytes=Buffer.concat(chunks),decoded=res.headers['content-encoding']==='gzip'?zlib.gunzipSync(bytes,{maxOutputLength:524288}):bytes;resolve({body:JSON.parse(decoded.toString('utf8')),headers:res.headers});}catch(_){reject(Error('invalid response'));}});
 });
 const deadline=setTimeout(()=>req.destroy(Error('timeout')),8000);req.on('close',()=>clearTimeout(deadline));req.on('error',reject);
});}
function normalize(response,now){
 const d=response.body,temp=d?.temperature,wind=d?.wind;
 if(d?.metadata?.zeroResult||temp?.unit!=='°C'||typeof temp.value!=='number'||!Number.isFinite(temp.value)||temp.value< -100||temp.value>70||typeof d.condition?.text!=='string'||!d.condition.text.trim()||d.condition.text.length>30)return fail('UPSTREAM');
 // Missing wind stays unknown, never turns into a false calm/0-level report.
 const scale=Number.isInteger(wind?.scale)&&wind.scale>=0&&wind.scale<=17?wind.scale:null;
 const modified=Date.parse(response.headers?.['last-modified']);
 if(Number.isFinite(modified)&&(now-modified>15*60000||modified>now+60000))return fail('STALE');
 return {temperature:temp.value,condition:d.condition.text,conditionCode:String(d.condition.code||''),windScale:scale,windDirection:DIRECTIONS[wind?.direction?.compass]||'风向待更新',windSpeed:wind?.speed?.unit==='m/s'&&Number.isFinite(wind.speed.value)?wind.speed.value:null,windGust:d.windGust?.unit==='m/s'&&Number.isFinite(d.windGust.value)?d.windGust.value:null,updatedAt:Number.isFinite(modified)?modified:null,fetchedAt:now,source:'和风天气',sourceUrl:'https://www.qweather.com',attributions:Array.isArray(d.metadata?.attributions)?d.metadata.attributions.filter(x=>typeof x==='string').slice(0,20):[]};
}
function createProvider({env=process.env,request=requestJSON,now=Date.now}={}){
 const cache=new Map(),jobs=new Map();
 return async function get(point){
  const key=point.latitude.toFixed(2)+','+point.longitude.toFixed(2),saved=cache.get(key);
  if(saved&&now()-saved.fetchedAt<60*60000)return saved;
  if(jobs.has(key))return jobs.get(key);
  const url=endpoint(env,point),headers=authorization(env,now());
  const job=request(url,headers).then(r=>{const data=normalize(r,now());if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,data);return data;}).finally(()=>jobs.delete(key));
  jobs.set(key,job);return job;
 };
}
module.exports={createProvider,normalize,endpoint,authorization,DIRECTIONS};
