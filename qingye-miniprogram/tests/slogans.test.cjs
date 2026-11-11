const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRotator, STORAGE_PREFIX, RETURN_AFTER_MS} = require('../miniprogram/services/slogans');
const catalog = require('../miniprogram/services/slogans-data');
function storage() {
  const values = {};
  return {values, get: k => structuredClone(values[k]), set: (k, v) => { values[k] = structuredClone(v); }};
}

test('all 120 paired entries are unique, balanced, enabled and fit the text budget', () => {
  assert.equal(catalog.entries.length, 120);
  assert.equal(new Set(catalog.entries.map(r => r.id)).size, 120);
  assert.equal(new Set(catalog.entries.map(r => r.title)).size, 120);
  for (const t of Object.keys(catalog.themes)) assert.equal(catalog.entries.filter(r => r.theme === t).length, 30);
  for (const r of catalog.entries) {
    assert.ok(r.enabled && r.title.length <= 16 && r.subtitle.length <= 34);
    assert.ok(r.title.trim() && r.subtitle.trim());
  }
  assert.deepEqual(catalog, JSON.parse(fs.readFileSync(path.join(__dirname, '../content/slogans.json'))));
});

test('a visit holds each placement steady and the next visit changes it', () => {
  const s = storage(), r = createRotator({storage: s});
  const home = r.get('home'), courses = r.get('courses'), profile = r.get('profile');
  for (let i = 0; i < 10; i++) assert.equal(r.get('home'), home);
  assert.equal(courses.theme, 'golf');
  assert.ok(['heal', 'move'].includes(profile.theme));
  assert.equal(r.get('courses'), courses);
  r.beginVisit();
  assert.notEqual(r.get('home').id, home.id);
  assert.notEqual(r.get('courses').id, courses.id);
  assert.notEqual(r.get('profile').id, profile.id);
  assert.deepEqual(Object.keys(s.values).sort(), ['courses', 'home', 'profile'].map(k => STORAGE_PREFIX + k));
});

test('each slot finishes its entire cycle without repeats, survives restarts and avoids boundary duplicates', () => {
  for (const [slot, length] of [['home', 120], ['courses', 30], ['profile', 60]]) {
    const s = storage();
    let last;
    for (let cycle = 0; cycle < 3; cycle++) {
      const seen = new Set();
      for (let i = 0; i < length; i++) {
        // Constant random also exercises the wrap boundary deterministically.
        const r = createRotator({storage: s, random: () => 0.999});
        const entry = r.get(slot);
        assert.notEqual(entry.id, last);
        assert.ok(!seen.has(entry.id));
        seen.add(entry.id); last = entry.id;
      }
      assert.equal(seen.size, length);
    }
  }
});

test('brief background switches keep the text; returning after one minute rotates', () => {
  const r = createRotator({storage: storage()}), first = r.get('home');
  r.pause(0); r.resume(RETURN_AFTER_MS - 1);
  assert.equal(r.get('home').id, first.id);
  r.pause(100000); r.resume(100000 + RETURN_AFTER_MS);
  assert.notEqual(r.get('home').id, first.id);
  const second = r.get('home'); r.resume(9999999);
  assert.equal(r.get('home').id, second.id);
});

test('damaged storage, empty pools and storage failures do not break a page', () => {
  for (const value of [null, 7, 'bad', [], {seen: 'bad'}, {seen: ['unknown', null], last: 'unknown'}]) {
    const r = createRotator({storage: {get: () => value, set: () => {}}});
    assert.ok(r.get('home').title);
  }
  const r = createRotator({storage: {get: () => {throw Error('read');}, set: () => {throw Error('full');}}});
  const first = r.get('home'); r.beginVisit();
  assert.notEqual(r.get('home').id, first.id);
  assert.ok(createRotator({entries: []}).get('home').title);
  const single = createRotator({entries: [catalog.entries[0]], storage: storage()});
  const one = single.get('home'); single.beginVisit(); assert.equal(single.get('home').id, one.id);
});

test('catalog updates keep seen history, include new entries and exclude disabled entries', () => {
  const s = storage(), original = catalog.entries.slice(0, 4);
  const first = createRotator({entries: original, storage: s, random: () => 0.999}).get('home');
  const records = original.map((r, i) => ({...r, enabled: i !== 1})).concat({...original[0], id: 'new'});
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const entry = createRotator({entries: records, storage: s}).get('home');
    assert.notEqual(entry.id, first.id); assert.notEqual(entry.id, original[1].id);
    seen.add(entry.id);
  }
  assert.equal(seen.size, 3); assert.ok(seen.has('new'));
});
