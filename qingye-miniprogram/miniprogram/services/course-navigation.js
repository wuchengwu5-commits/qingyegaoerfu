const Dialog = require('./dialog');
const {valid} = require('./location');

// GCJ-02 club destinations from Amap place pages, keyed by catalog course ID.
// These destinations are independent of the coordinates used for course maps.
const amapPoints = {
  cn_bg_2525: [31.107977, 121.219822, 'B0015477AC'], // 佘山
  cn_bg_577: [31.058428, 121.138796, 'B00155GLK4'], // 天马
  cn_bg_571: [31.052920, 121.350675, 'B00156OK1A'], // 旗忠
  cn_bg_585: [31.162778, 121.253412, 'B001500023'], // 银涛
  cn_bg_575: [31.218914, 121.582013, 'B00151418D'], // 汤臣
  cn_bg_569: [31.403286, 121.370889, 'B00155QWX2'], // 美兰湖名人赛
  cn_bg_9127: [31.403286, 121.370889, 'B00155QWX2'], // 美兰湖尼克劳斯
  cn_bg_567: [31.230567, 121.759956, 'B001557HAE'], // 林克司
  cn_bg_583: [31.153276, 121.008358, 'B02000IYTM'], // 旭宝
  cn_bg_619: [31.250806, 120.942116, 'B02000IDN1'], // 昆山太阳岛
  cn_bg_537: [31.363095, 120.699303, 'B02000KBUZ'], // 苏州太阳岛
  cn_bg_529: [31.132202, 120.829161, 'B020007AXJ'], // 光明
  cn_bg_531: [31.289202, 120.700890, 'B02000811S'], // 金鸡湖
  cn_bg_535: [31.220840, 120.400528, 'B020007DZJ'], // 苏州太湖
  cn_bg_539: [31.367812, 120.664621, 'B020001TVE'], // 苏州中兴
  cn_bg_605: [30.336391, 120.809788, 'B023D03NT8'], // 尖山龙场
  cn_bg_623: [30.336391, 120.809788, 'B023D03NT8'], // 尖山凤场
};

function destinationFor(course) {
  const hasCatalogPoint = course.coordinateSystem === 'gcj02' && valid(course.latitude, course.longitude);
  const localPoint = Object.prototype.hasOwnProperty.call(amapPoints, course.id) ? amapPoints[course.id] : null;
  if (localPoint && !(hasCatalogPoint && course.coordinateStatus === 'verified')) {
    const [latitude, longitude, amapPoiId] = localPoint;
    return {latitude, longitude, amapPoiId, sourceUrl: `https://www.amap.com/place/${amapPoiId}`};
  }
  return hasCatalogPoint ? {latitude: course.latitude, longitude: course.longitude} : null;
}

function copyOption(owner, course, reason) {
  const details = [course.name, course.address || course.city].filter(Boolean).join('\n');
  if (!details) return;
  return new Promise(resolve => Dialog.modal({
    owner,
    title: '球场导航',
    content: `${reason}\n\n${details}`,
    confirmText: '复制球场信息',
    success: result => {
      if (result.confirm) wx.setClipboardData({data: details});
    },
    complete: resolve,
  }));
}

function openWith(invoke) {
  return new Promise(resolve => {
    try {
      invoke({
        success: () => resolve('opened'),
        fail: error => resolve(/cancel/i.test(error?.errMsg || '') ? 'cancelled' : 'unavailable'),
      });
    } catch (error) {
      resolve('unavailable');
    }
  });
}

async function open(owner, course, point) {
  if (!point) {
    return copyOption(owner, course, '该球场还没有可用的导航坐标，可复制球场信息到地图搜索。');
  }
  const {latitude, longitude, amapPoiId} = point;
  const destination = course.name;
  const poi = amapPoiId ? {poiId: {amap: amapPoiId}} : {};
  const external = await openWith(callbacks => {
    const map = wx.createMapContext('course-navigation-map');
    map.openMapApp({latitude, longitude, destination, ...poi, ...callbacks});
  });
  if (external !== 'unavailable' || Dialog.currentPage() !== owner) return;

  const location = await openWith(callbacks => {
    wx.openLocation({latitude, longitude, name: destination, address: course.address || '', ...callbacks});
  });
  if (location === 'unavailable' && Dialog.currentPage() === owner) {
    return copyOption(owner, course, '暂时无法打开地图，可复制球场信息到地图搜索。');
  }
}

module.exports = {destinationFor, open};
