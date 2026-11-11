// Read the published, georeferenced hole maps. Clients have no write operation.
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const database = cloud.database();
const collection = 'qy_gps_holes';
const courses = { cn_bg_611: {count:27,schema:1}, cn_bg_577: {count:27,schema:2} };
const mediaRoot = 'cloud://cloud1-d7gketoi570d17f80.636c-cloud1-d7gketoi570d17f80-1524135194/media-v1/';
const chunkBytes = 675000; // Multiple of three for Base64 concatenation on the client.
const maxChunks = 8;

async function readMapImage(name, index) {
  if (typeof name !== 'string' || name.length > 220 || !/^packages__[a-z0-9-]+-map__[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.jpe?g$/i.test(name) ||
      !Number.isInteger(index) || index < 0 || index >= maxChunks) {
    return { ok: false, message: '无效的球道图片' };
  }
  const { fileContent } = await cloud.downloadFile({ fileID: mediaRoot + name });
  const chunks = Math.ceil(fileContent.length / chunkBytes);
  if (fileContent[0] !== 0xff || fileContent[1] !== 0xd8 || chunks > maxChunks || index >= chunks) {
    return { ok: false, message: '无法读取球道图片' };
  }
  const offset = index * chunkBytes;
  return { ok: true, index, chunks, data: fileContent.subarray(offset, offset + chunkBytes).toString('base64') };
}

exports.main = async ({ courseId, action, name, index } = {}) => {
  const caller = cloud.getWXContext();
  if (caller.APPID !== 'wx771368adc305a848' || !caller.OPENID) {
    return { ok: false, message: '请从青野小程序查看球道图' };
  }
  if (action === 'mapImage') return readMapImage(name, index);
  if (typeof courseId !== 'string' || !Object.prototype.hasOwnProperty.call(courses, courseId)) {
    return { ok: false, message: '该球场的 GPS 图尚未开放' };
  }
  const { data: holes } = await database.collection(collection)
    .where({ courseId, schema: courses[courseId].schema }).limit(courses[courseId].count + 1).get();
  if (holes.length !== courses[courseId].count) {
    return { ok: false, message: '球道资料更新中，请重试' };
  }
  return { ok: true, courseId, holes };
};
