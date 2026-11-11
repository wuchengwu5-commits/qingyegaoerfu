const D=require('./data'),S=require('./satellite-holes');
module.exports={"courseId": "cn_bg_585", "route": "/packages/hole-map/index", "assetRoot": "/packages/hole-map", "photo": "/packages/hole-map/satellite.jpg", "atlas": "/packages/hole-map/course-overview.jpg", "availabilityNote": "18 洞卫星图已开放", "attribution": "Esri · Vantor · GIS Community / © OpenStreetMap", "overviewNote": "银涛全场卫星实景。双指缩放、拖动查看；左上角选择球洞。底图来源：Esri / Vantor / GIS User Community。", "mapNote": "距离为地图水平直线估算；果岭中心不是当天旗位，前后沿按起点到中心方向计算。优先显示正在记分的球洞；GPS 仅在唯一匹配的球道范围内自动对应球洞，存在歧义时保持当前洞。已授权时获取定位并在前台刷新，偏差较大则保留参考起点。拖动起点后不会被定位覆盖；复位只还原视角和落点，保留你的起点。\nTee 与单位沿用开局设置；颜色标记不代表当天发球标志的实测位置。未开局时以码预览。\n底图：Esri / Vantor / GIS User Community。1 号洞影像标注日期 2025-04-25，2–18 号洞复用已保存的全场卫星影像（2026-10-25 获取）。\n果岭与发球区参考 © OpenStreetMap contributors 历史资料，并对照球场总览核对洞号，尚未实地校准。图上起点为可拖动的参考点，不随 Tee 色点自动改变。定位在已授权进入地图或主动点击后获取，前台约每 5 秒刷新，隐藏页面时停止，不上传、不保存。"};
Object.assign(module.exports,{defaultMap:D,holes:{[D.id]:D,...S.holes},overview:require('./overview-data')});
// Library-backed reference artwork.
Object.assign(module.exports,{references:require("./reference-holes"),referenceNote:"按球道资料和卫星参考重绘的美术参考图，球道、果岭、沙坑、水域和树木采用立体卡通表达。存在艺术化偏差，不用于 GPS 定位或测距；需要测距时请切换 GPS 图。图片无发球台标记点。",availabilityNote:"18 洞参考图与 GPS 图已开放"});

module.exports.atlasRoute="/packages/hole-map/atlas";
// Registered artwork over the GPS canvas.
Object.assign(module.exports,{artOverlay:true});
