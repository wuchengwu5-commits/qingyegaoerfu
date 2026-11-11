const M=require('./map-core');
function acceptFix(f,d){
 if(!d||!Number.isFinite(f?.latitude)||!Number.isFinite(f?.longitude)||Math.abs(f.latitude)>90||Math.abs(f.longitude)>180)return {ok:false,reason:'定位暂不可用，可拖动起点'};
 if(!Number.isFinite(f.accuracy)||f.accuracy<0||f.accuracy>30)return {ok:false,reason:'定位偏差较大，可拖动起点'};
 const p=M.toPixel([f.longitude,f.latitude],d);
 // A rotated crop may also contain the adjacent hole: accept only this hole's
 // display corridor. GPS never selects a hole or moves a manual reference.
 if(!M.inBounds(p,d)||M.focusOpacity(p,d)<.45)return {ok:false,reason:'位置不在本洞附近，可拖动起点'};
 return {ok:true,point:p,accuracy:Math.round(f.accuracy)};
}
function acceptOverviewFix(f,d){
 if(!d?.extent||!Number.isFinite(f?.latitude)||!Number.isFinite(f?.longitude)||Math.abs(f.latitude)>90||Math.abs(f.longitude)>180)return {ok:false,reason:'暂未取得有效位置'};
 if(!Number.isFinite(f.accuracy)||f.accuracy<0||f.accuracy>30)return {ok:false,reason:'定位偏差较大，请稍后重试'};
 const point=M.toPixel([f.longitude,f.latitude],d);if(!M.inBounds(point,d))return {ok:false,reason:'当前位置不在该球场卫星范围内'};
 return {ok:true,point,accuracy:Math.round(f.accuracy)};
}
function resolveHole(f,holes){
 const matches=holes.filter(h=>!h.diagram&&h.extent).map(h=>({hole:h,fix:acceptFix(f,h)})).filter(x=>x.fix.ok);
 return matches.length===1?matches[0]:null;
}
module.exports={acceptFix,acceptOverviewFix,resolveHole};
