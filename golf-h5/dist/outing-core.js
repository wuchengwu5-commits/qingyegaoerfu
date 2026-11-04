(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.GolfOuting=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const themes=[
  {id:'wild',name:'去旷野',title:['把自己，','交还给旷野。'],lines:['风经过球道，也经过心里。','今天，只与好风景相逢。']},
  {id:'slow',name:'慢下来',title:['慢一点，','好风景在路上。'],lines:['把忙碌留在场外，把呼吸还给自己。','有些时光，不必用成绩衡量。']},
  {id:'next',name:'下一杆',title:['心有旷野，','下一杆皆可期待。'],lines:['沿着绿色走一走，给生活一点留白。','挥出去的，是球，也是烦恼。']}
 ];
 function navigationLinks(course){
  const name=String(course?.name||'').trim(),address=String(course?.address||'').trim(),region=String(course?.city||course?.province||'').split('/')[0].trim();
  if(!name&&!address)return [];
  const query=name||address,destination=[address,name].filter(Boolean).join(' ');
  const amap=new URL('https://uri.amap.com/search');amap.search=new URLSearchParams({keyword:query,...(region?{city:region}:{}),view:'list',src:'qingye.golf',callnative:'1'});
  const baidu=new URL('https://api.map.baidu.com/place/search');baidu.search=new URLSearchParams({query,...(region?{region}:{}),output:'html',src:'webapp.musheng.qingye'});
  const apple=new URL('https://maps.apple.com/directions');apple.search=new URLSearchParams({destination});
  return [{id:'amap',name:'高德地图',hint:'查找球场 · 支持唤起 App',url:amap.href},{id:'baidu',name:'百度地图',hint:'查找球场 · 地图中选择导航',url:baidu.href},{id:'apple',name:'Apple 地图',hint:'适用于 iPhone 与 Apple 设备',url:apple.href}];
 }
 function scoreCaption(summary,holeCount){
  if(!summary||!summary.played)return '本轮尚未记录实际完洞成绩';
  return `${summary.played===holeCount?'本轮实际':'已完 '+summary.played+' 洞实际'} ${summary.totalText} 杆 · ${summary.diffText}`;
 }
 return {themes,navigationLinks,scoreCaption};
});
