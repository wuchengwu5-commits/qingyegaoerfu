const routes={cn_bg_585:'/packages/hole-map/index',cn_bg_2525:'/packages/sheshan-map/index',cn_bg_577:'/packages/tianma-map/index',cn_bg_565:'/packages/huakai-map/index',cn_bg_567:'/packages/links-map/index',cn_bg_569:'/packages/meilan-masters-map/index',cn_bg_9127:'/packages/meilan-nicklaus-map/index',cn_bg_571:'/packages/qizhong-map/index'};
function route(id){return routes[id]||'/packages/hole-map/index';}
function available(id){return !!routes[id];}
function gpsCount(id){return ({cn_bg_585:18,cn_bg_2525:18,cn_bg_571:18,cn_bg_577:1})[id]||0;}
function gpsAvailable(id){return gpsCount(id)>0;}
module.exports={route,available,gpsAvailable,gpsCount};
