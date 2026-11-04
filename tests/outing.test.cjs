const test=require('node:test');
const assert=require('node:assert/strict');
const outing=require('../golf-h5/dist/outing-core.js');
test('导航链接保留中文和特殊字符，不把球场文字解释为URL参数',()=>{
 const name='上海银涛 & 湖畔 #1 ?测试',address='上海市青浦区沪青平公路2222号';
 const links=outing.navigationLinks({name,address,city:'上海市'});
 assert.equal(links.length,3);
 const amap=new URL(links[0].url),baidu=new URL(links[1].url),apple=new URL(links[2].url);
 assert.equal(amap.searchParams.get('keyword'),name);assert.equal(amap.searchParams.get('callnative'),'1');assert.equal(amap.searchParams.get('city'),'上海市');
 assert.equal(baidu.searchParams.get('query'),name);assert.equal(baidu.searchParams.get('output'),'html');
 assert.equal(apple.searchParams.get('destination'),address+' '+name);
 links.forEach(l=>{assert.equal(new URL(l.url).protocol,'https:');assert.equal(new URL(l.url).hash,'');});
});
test('缺少地址仍按球场名称检索，不编造坐标',()=>{
 const links=outing.navigationLinks({name:'待补充球场',province:'浙江省'});
 assert.equal(links.length,3);assert.equal(new URL(links[0].url).searchParams.get('keyword'),'待补充球场');
 for(const l of links){const u=new URL(l.url);for(const k of ['lat','lng','center','location'])assert.equal(u.searchParams.has(k),false);}
 assert.deepEqual(outing.navigationLinks({}),[]);
});
test('部分完洞成绩在明信片上明确注明已完洞数',()=>{
 const caption=outing.scoreCaption({played:12,totalText:'53',diffText:'+4'},18);
 assert.equal(caption,'已完 12 洞实际 53 杆 · +4');assert.ok(!caption.includes('76'));
 assert.equal(outing.scoreCaption({played:18,totalText:'76',diffText:'+4'},18),'本轮实际 76 杆 · +4');
 assert.equal(outing.scoreCaption({played:0},18),'本轮尚未记录实际完洞成绩');
});
