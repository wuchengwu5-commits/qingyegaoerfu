// Each placement has its own persistent shuffled deck; a visit holds its copy still.
const catalog = require('./slogans-data');
const STORAGE_PREFIX = 'qingye.slogans.v1.';
const RETURN_AFTER_MS = 60 * 1000;
const THEMES_BY_SLOT = {home: null, courses: ['golf'], profile: ['heal', 'move']};
const FALLBACK = {id: 'fallback', theme: 'relax', title: '走进绿意，把心放慢', subtitle: '沿着球道走一走，让呼吸慢下来。'};

function createRotator({entries = catalog.entries, storage, random = Math.random} = {}) {
  let current = {}, memory = {}, hiddenAt = null;

  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const value = out[i]; out[i] = out[j]; out[j] = value;
    }
    return out;
  }

  function forSlot(slot) {
    if (!Object.prototype.hasOwnProperty.call(THEMES_BY_SLOT, slot)) throw new Error('Unknown slogan placement');
    const themes = THEMES_BY_SLOT[slot];
    return entries.filter(r => r.enabled && (!themes || themes.includes(r.theme)));
  }

  function read(slot) {
    if (memory[slot]) return memory[slot];
    try { return storage && storage.get(STORAGE_PREFIX + slot) || {}; } catch (_) { return {}; }
  }

  function get(slot) {
    if (current[slot]) return current[slot];
    const pool = forSlot(slot);
    if (!pool.length) return (current[slot] = FALLBACK);
    const byId = new Map(pool.map(r => [r.id, r]));
    const raw = read(slot);
    const saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    // Keep history across catalog additions/removals; disabled entries disappear immediately.
    let seen = new Set(Array.isArray(saved.seen) ? saved.seen.filter(id => byId.has(id)) : []);
    let choices = pool.filter(r => !seen.has(r.id));
    if (!choices.length) { seen = new Set(); choices = pool; }
    let deck = shuffle(choices);
    // Avoid repeating the last item when a new cycle begins (or storage was malformed).
    if (deck.length > 1 && deck[0].id === saved.last) [deck[0], deck[1]] = [deck[1], deck[0]];
    const picked = deck[0];
    seen.add(picked.id);
    const next = {seen: Array.from(seen), last: picked.id};
    memory[slot] = next;
    try { if (storage) storage.set(STORAGE_PREFIX + slot, next); } catch (_) { /* Memory still rotates for this process. */ }
    current[slot] = picked;
    return picked;
  }

  function beginVisit() { current = {}; hiddenAt = null; }
  function pause(now = Date.now()) { hiddenAt = now; }
  function resume(now = Date.now()) {
    if (hiddenAt !== null && now - hiddenAt >= RETURN_AFTER_MS) beginVisit();
    hiddenAt = null;
  }
  return {get, beginVisit, pause, resume};
}

const rotator = createRotator({storage: {
  get(key) { return typeof wx !== 'undefined' ? wx.getStorageSync(key) : null; },
  set(key, value) { if (typeof wx !== 'undefined') wx.setStorageSync(key, value); }
}});
module.exports = Object.assign({createRotator, STORAGE_PREFIX, RETURN_AFTER_MS}, rotator);
