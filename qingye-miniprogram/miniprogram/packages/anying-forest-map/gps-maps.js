const Cloud = require('../../services/cloud-client');
const config = require('../../config');

function decode(courseId, holeIds, catalog) {
  if (catalog?.courseId !== courseId || !Array.isArray(catalog.holes) ||
      catalog.holes.length !== holeIds.length) throw Error('球洞资料不完整');
  const maps = {};
  const imageRoot = config.mediaRoot.replace(/\/media-v1$/, '/hole-gps-v1/') + courseId + '/';
  for (const row of catalog.holes) {
    if (!row || row.schema !== 1 || row.courseId !== courseId ||
        !Number.isInteger(row.number) || holeIds[row.number - 1] !== row._id ||
        maps[row._id] || !/^[a-z0-9_]+$/.test(row._id)) throw Error('洞号不一致');
    const { width, height, extent, satelliteImage } = row;
    if (![width, height].every(v => Number.isInteger(v) && v > 0 && v <= 4096) ||
        typeof satelliteImage !== 'string' || !satelliteImage.startsWith(imageRoot) ||
        !/^[a-zA-Z0-9_-]+\.jpg$/.test(satelliteImage.slice(imageRoot.length))) throw Error('卫星图资料无效');
    if (extent?.spatialReference?.wkid !== 4326 ||
        ![extent.xmin, extent.ymin, extent.xmax, extent.ymax].every(Number.isFinite) ||
        !(extent.xmin >= -180 && extent.xmin < extent.xmax && extent.xmax <= 180 &&
          extent.ymin >= -90 && extent.ymin < extent.ymax && extent.ymax <= 90)) throw Error('卫星图坐标无效');
    const validPixel = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
      p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height;
    const pixel = point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw Error('GPS 点无效');
      const position = [(point[0] - extent.xmin) * width / (extent.xmax - extent.xmin),
        (extent.ymax - point[1]) * height / (extent.ymax - extent.ymin)];
      if (!validPixel(position)) throw Error('GPS 点超出本洞范围');
      return position;
    };
    if (!Array.isArray(row.greenOutline) || row.greenOutline.length < 3 || row.greenOutline.length > 512 ||
        !Array.isArray(row.focusRoute) || row.focusRoute.length < 2 || row.focusRoute.length > 512 ||
        !row.focusRoute.every(validPixel) || ![3, 4, 5, 6].includes(row.par) ||
        ![row.focusRadius, row.focusPaddingX, row.focusPaddingY, row.focusSolidBuffer, row.focusFeather, row.edgeFeather].every(v => Number.isFinite(v) && v >= 0) ||
        !Number.isInteger(row.maskStep) || row.maskStep < 1 || row.maskStep > 16) throw Error('球道轮廓无效');
    maps[row._id] = {
      id: row._id, courseId, number: row.number, par: row.par, width, height, extent,
      satelliteOnly: true, satelliteImage, defaultOrigin: pixel(row.tee),
      defaultTarget: pixel(row.target), greenCenter: pixel(row.green),
      features: [{id: 'green', kind: 'green', points: row.greenOutline.map(pixel)}],
      focusRoute: row.focusRoute, focusRadius: row.focusRadius, focusSolidBuffer: row.focusSolidBuffer,
      focusFeather: row.focusFeather, edgeFeather: row.edgeFeather, maskStep: row.maskStep,
      focusPaddingX: row.focusPaddingX, focusPaddingY: row.focusPaddingY,
      directApproach: row.directApproach === true, verified: row.verified === true, revision: row.revision
    };
  }
  return maps;
}

async function read(courseId, holeIds) {
  const cacheKey = 'qingye-gps-db-v1/' + courseId;
  try {
    let result;
    if (wx.__preview && wx.readPreviewGpsCatalog) {
      result = await wx.readPreviewGpsCatalog(courseId);
    } else {
      const cloud = Cloud.init();
      if (!cloud) throw Error('云服务暂不可用');
      const response = await cloud.callFunction({ name: 'qingyeGpsMaps', data: { courseId } });
      result = response.result;
    }
    if (!result?.ok) throw Error('GPS 资料未就绪');
    const maps = decode(courseId, holeIds, result);
    try { wx.setStorageSync(cacheKey, result); } catch (_) { /* Storage can be full. */ }
    return { maps, source: wx.__preview ? 'preview' : 'database' };
  } catch (error) {
    try { return { maps: decode(courseId, holeIds, wx.getStorageSync(cacheKey)), source: 'cache' }; }
    catch (_) { throw error; }
  }
}
module.exports = { read, decode };
