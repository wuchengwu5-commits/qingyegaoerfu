// Rules for a round are copied into its snapshot. Old records keep their own terms.
// Paired amateur presets: https://www.sohu.com/a/223309073_492715
// Course rules: https://www.randa.org/zh-CN/rog/the-rules-of-golf/rule-1
const options = [
  {id:'official', name:'球场规则', summary:'按高尔夫规则、当日球场当地规则和本场赛制记分。'},
  {id:'large', name:'大流氓', summary:'界内按球的原位打（No Touch）。出界或下水，加罚一杆，回上一击处重打。'},
  {id:'small', name:'小流氓', summary:'开球前确认界内范围，默认本洞球道、沙坑、果岭。落在约定范围外或下水，加罚一杆，回上一击处重打。'}
];
function name(mode) {
  return options.find(item=>item.id===mode)?.name || (mode==='custom'?'旧版自定义规则':'旧版未注明规则');
}
function make(mode) {
  const item=options.find(option=>option.id===mode);
  if(!item)throw Error('请选择球场规则、大流氓或小流氓');
  if(mode==='official')return {mode,localRules:[]};
  const large=mode==='large';
  const boundary=large?'按球场划定的边界':'开球前确认本洞界内范围，默认球道、沙坑和果岭';
  // The source describes the special cases below. The template explicitly
  // refers unlisted situations back to the course and competition rules.
  const normal={action:'按当日球场规则及所选赛制处理',outcome:'记录实际杆数和已发生的罚杆',area:'本场适用区域',note:'服从球场的禁入、禁打及安全要求'};
  const replay={action:'回上一击处重打',outcome:'加罚一杆，重打另计',area:boundary,note:'例如第一杆出界，重打的一杆是第三杆'};
  const position=large?{action:'界内按原球位继续；无法安全击球时回上一击处重打',outcome:'原位继续按实际杆数记，退回重打加罚一杆',area:'界内长草或树林',note:'以球场安全要求为先'}:{...replay,area:'本洞约定界内范围之外'};
  return {
    mode,preset:large?'no-touch-v1':'agreed-boundary-v1',
    summary:item.summary,
    localRules:['本模板未另列的情况，按当日球场规则与所选赛制处理。'],
    // The seven positions match rules.topics, including the legacy cloud format.
    topics:[{...replay,area:boundary+'；遗失球按球场规则判定'},
      {...replay,area:'本版约定的下水球'},position,
      large?{...position,area:'界内车道，球场允许且安全时'}:{...normal},
      {...normal},{...normal},{...normal}]
  };
}
module.exports={options,name,make};
