const {test, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const Navigation = require('../miniprogram/services/course-navigation');
const Dialog = require('../miniprogram/services/dialog');
const {courses} = require('../miniprogram/services/courses-data');

const course = courses.find(item => item.id === 'cn_bg_2525');
const point = Navigation.destinationFor(course);
const owner = {};
const originalModal = Dialog.modal;

afterEach(() => {
  delete global.wx;
  delete global.getCurrentPages;
  Dialog.modal = originalModal;
});

test('external map receives the matched club coordinates and POI instead of the old catalog point', async () => {
  let request;
  global.wx = {
    createMapContext(id) {
      assert.equal(id, 'course-navigation-map');
      return {openMapApp(options) {request = options; options.success({});}};
    },
  };
  await Navigation.open(owner, course, point);
  assert.equal(request.destination, course.name);
  assert.equal(request.latitude, 31.107977);
  assert.equal(request.longitude, 121.219822);
  assert.deepEqual(request.poiId, {amap: 'B0015477AC'});
  assert.notEqual(request.longitude, course.longitude);
});

test('unavailable external navigation falls back to WeChat with the same destination', async () => {
  global.getCurrentPages = () => [owner];
  let destination;
  global.wx = {
    createMapContext: () => ({}),
    openLocation(options) {destination = options; options.success({});},
  };
  await Navigation.open(owner, course, point);
  assert.equal(destination.name, course.name);
  assert.equal(destination.latitude, point.latitude);
  assert.equal(destination.longitude, point.longitude);
});

test('cancelling the app picker never opens a second map', async () => {
  global.getCurrentPages = () => [owner];
  let fallbacks = 0;
  global.wx = {
    createMapContext: () => ({openMapApp(options) {options.fail({errMsg: 'openMapApp:fail cancel'});}}),
    openLocation(options) {fallbacks++; options.success({});},
  };
  await Navigation.open(owner, course, point);
  assert.equal(fallbacks, 0);
});

test('unknown coordinate systems require explicit copy and verified catalog updates take priority', async () => {
  const unknown = {...course, id: 'another-course', coordinateSystem: 'unknown'};
  assert.equal(Navigation.destinationFor(unknown), null);
  const verified = {...course, coordinateSystem: 'gcj02', coordinateStatus: 'verified'};
  assert.deepEqual(Navigation.destinationFor(verified), {latitude: course.latitude, longitude: course.longitude});
  let copied;
  global.wx = {setClipboardData: options => {copied = options.data;}};
  Dialog.modal = options => {options.success({confirm: false}); options.complete();};
  await Navigation.open(owner, unknown, null);
  assert.equal(copied, undefined);
  Dialog.modal = options => {options.success({confirm: true}); options.complete();};
  await Navigation.open(owner, unknown, null);
  assert.equal(copied, `${unknown.name}\n${unknown.address}`);
});
