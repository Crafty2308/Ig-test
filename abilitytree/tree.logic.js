/* ============================================================
   ability tree - LOGIC
   Pure rules + compilation + persistence for one tree per character.
   Never touches the DOM and never touches game code: the game reads
   compiled stats only.
   ============================================================ */
(function (root, factory) {
  const data = (typeof module !== 'undefined' && module.exports)
    ? require('./tree.data.js')
    : root.AbilityTreeData;
  const api = factory(data);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbilityTree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA) {
  'use strict';

  const { TREES, DEFAULT_CHAR, STAT_BASE, TIER_COST, FLAGS } = DATA;

  /* ---- per-tree indexes, built once ---- */
  const INDEX = {};
  for (const charId in TREES) {
    const t = TREES[charId];
    const byId = Object.create(null);
    for (const n of t.nodes) byId[n.id] = n;

    const children = Object.create(null);
    for (const n of t.nodes) for (const p of (n.parents || [])) (children[p] || (children[p] = [])).push(n.id);

    /* blocks are mutual: if A lists B, taking either locks the other */
    const blockedBy = Object.create(null);
    const link = (a, b) => {
      const list = blockedBy[a] || (blockedBy[a] = []);
      if (list.indexOf(b) === -1) list.push(b);
    };
    for (const n of t.nodes) for (const b of (n.blocks || [])) { link(b, n.id); link(n.id, b); }

    const archetypes = {};
    for (const a of t.archetypes) archetypes[a.id] = a;

    INDEX[charId] = { charId, nodes: t.nodes, byId, children, blockedBy, archetypes, archList: t.archetypes };
  }

  const CHAR_IDS = Object.keys(TREES);
  const SAVE_KEY = 'neon.abilityTree';
  const SAVE_VERSION = 2;

  /* ---------------- points ---------------- */

  /* the single hook the game calls. One point per level, a bonus every fifth. */
  function pointsForLevel(level) {
    const l = Math.max(0, Math.floor(level || 0));
    return l + Math.floor(l / 5);
  }

  function costOf(nodeOrId, charId) {
    const n = typeof nodeOrId === 'string' ? nodeFor(nodeOrId, charId) : nodeOrId;
    return n ? (TIER_COST[n.tier] || 1) : 0;
  }

  /* node ids carry their character prefix, so a lookup never needs the state */
  function nodeFor(id, charId) {
    if (charId && INDEX[charId] && INDEX[charId].byId[id]) return INDEX[charId].byId[id];
    for (const c of CHAR_IDS) if (INDEX[c].byId[id]) return INDEX[c].byId[id];
    return null;
  }

  /* ---------------- state ---------------- */
  /* state = { version, active, chars: { charId: {level, unlocked[]} }, compiled } */
  function createState(active) {
    const s = { version: SAVE_VERSION, active: active && TREES[active] ? active : DEFAULT_CHAR, chars: {} };
    for (const c of CHAR_IDS) s.chars[c] = { level: 0, unlocked: [] };
    s.compiled = recomputeStats(s);
    return s;
  }

  const tree = state => INDEX[state.active] || INDEX[DEFAULT_CHAR];
  const bucket = (state, charId) => {
    const id = charId || state.active;
    if (!state.chars[id]) state.chars[id] = { level: 0, unlocked: [] };
    return state.chars[id];
  };

  function setCharacter(state, charId) {
    if (!TREES[charId]) return state;
    state.active = charId;
    bucket(state, charId);
    state.compiled = recomputeStats(state);
    return state;
  }

  const has = (state, id, charId) => bucket(state, charId).unlocked.indexOf(id) !== -1;
  const pointsSpent = (state, charId) => bucket(state, charId).unlocked
    .reduce((sum, id) => sum + costOf(id, charId || state.active), 0);
  const pointsTotal = (state, charId) => pointsForLevel(bucket(state, charId).level);
  const pointsLeft = (state, charId) => pointsTotal(state, charId) - pointsSpent(state, charId);

  /* Points are earned per character: playing ROOK does not pay for NYX's tree.
     Replaying a level already reached grants nothing. */
  function grantPoints(state, level, charId) {
    const b = bucket(state, charId);
    const before = pointsForLevel(b.level);
    b.level = Math.max(b.level || 0, Math.floor(level || 0));
    const gained = pointsForLevel(b.level) - before;
    if (gained > 0) state.compiled = recomputeStats(state);
    return gained;
  }

  function archetypeCounts(state, charId) {
    const id = charId || state.active;
    const idx = INDEX[id] || INDEX[DEFAULT_CHAR];
    const counts = {};
    for (const key in idx.archetypes) counts[key] = 0;
    for (const nid of bucket(state, id).unlocked) {
      const n = idx.byId[nid];
      if (n && n.archetype && counts[n.archetype] !== undefined) counts[n.archetype]++;
    }
    return counts;
  }

  function dominantArchetype(counts) {
    let best = null, bestN = 0, tied = false;
    for (const key in counts) {
      if (counts[key] > bestN) { best = key; bestN = counts[key]; tied = false; }
      else if (counts[key] === bestN && bestN > 0) tied = true;
    }
    return bestN === 0 || tied ? null : best;
  }

  /* ---------------- the one rule function ---------------- */
  /* Used by the UI for painting and tooltips AND by the click handler. No second copy. */
  function canUnlock(nodeId, state) {
    const idx = tree(state);
    const node = idx.byId[nodeId];
    if (!node) return { ok: false, reasons: ['Unknown ability: ' + nodeId] };

    const reasons = [];
    if (has(state, nodeId)) return { ok: false, reasons: ['Already unlocked'] };

    const cost = costOf(node);
    const left = pointsLeft(state);
    if (left < cost) reasons.push('Needs ' + cost + ' point' + (cost === 1 ? '' : 's') + ', you have ' + left);

    const parents = node.parents || [];
    if (parents.length && !parents.some(p => has(state, p))) {
      const names = parents.map(p => (idx.byId[p] ? idx.byId[p].name : p));
      reasons.push('Requires ' + (names.length > 1 ? 'one of: ' : '') + names.join(' or '));
    }

    for (const other of (idx.blockedBy[nodeId] || [])) {
      if (has(state, other)) reasons.push('Locked out by ' + (idx.byId[other] ? idx.byId[other].name : other));
    }

    const reqs = node.reqs || {};
    if (reqs.archetypeMin) {
      const { name, count } = reqs.archetypeMin;
      const have = archetypeCounts(state)[name] || 0;
      if (have < count) {
        const label = idx.archetypes[name] ? idx.archetypes[name].name : name;
        reasons.push('Requires ' + count + ' ' + label + ' abilities (you have ' + have + ')');
      }
    }
    if (reqs.pointsSpentMin) {
      const spent = pointsSpent(state);
      if (spent < reqs.pointsSpentMin) {
        reasons.push('Requires ' + reqs.pointsSpentMin + ' points spent in this tree (you have ' + spent + ')');
      }
    }

    return { ok: reasons.length === 0, reasons };
  }

  /* purely for painting */
  function nodeStatus(nodeId, state) {
    const idx = tree(state);
    if (has(state, nodeId)) return 'unlocked';
    for (const other of (idx.blockedBy[nodeId] || [])) if (has(state, other)) return 'blocked';
    if (canUnlock(nodeId, state).ok) return 'reachable';
    const node = idx.byId[nodeId];
    if (!node) return 'locked';
    const parents = node.parents || [];
    return (!parents.length || parents.some(p => has(state, p))) ? 'available' : 'locked';
  }

  function unlock(nodeId, state) {
    const check = canUnlock(nodeId, state);
    if (!check.ok) return { ok: false, reasons: check.reasons, state };
    bucket(state).unlocked.push(nodeId);
    state.compiled = recomputeStats(state);
    save(state);
    return { ok: true, reasons: [], state };
  }

  /* refunds the active character's tree only - each one is banked separately */
  function reset(state, charId) {
    bucket(state, charId).unlocked = [];
    state.compiled = recomputeStats(state);
    save(state);
    return state;
  }

  /* ---------------- compilation ---------------- */
  /* additive first, then multiplicative. flags into a Set. */
  function recomputeStats(state, charId) {
    const id = charId || state.active || DEFAULT_CHAR;
    const idx = INDEX[id] || INDEX[DEFAULT_CHAR];
    const add = Object.create(null);
    const mult = Object.create(null);
    const flags = new Set();

    for (const nid of bucket(state, id).unlocked) {
      const node = idx.byId[nid];
      if (!node) continue;                        // defensive: unknown ids are dropped on load
      const list = node.effects || (node.effect ? [node.effect] : []);
      for (const e of list) {
        if (!e) continue;
        if (e.flag) { flags.add(e.flag); continue; }
        if (!e.stat) continue;
        if (e.op === 'mult') mult[e.stat] = (mult[e.stat] === undefined ? 1 : mult[e.stat]) * e.value;
        else add[e.stat] = (add[e.stat] || 0) + e.value;
      }
    }

    const stats = {};
    const keys = new Set(Object.keys(STAT_BASE).concat(Object.keys(add), Object.keys(mult)));
    for (const k of keys) {
      const base = STAT_BASE[k] !== undefined ? STAT_BASE[k] : 0;
      stats[k] = (base + (add[k] || 0)) * (mult[k] === undefined ? 1 : mult[k]);
    }

    const counts = archetypeCounts(state, id);
    return {
      charId: id,
      stats,
      flags,
      archetypeCounts: counts,
      dominant: dominantArchetype(counts),
      pointsTotal: pointsTotal(state, id),
      pointsSpent: pointsSpent(state, id),
      pointsLeft: pointsLeft(state, id),
      level: bucket(state, id).level
    };
  }

  /* ---------------- persistence ---------------- */
  const MIGRATIONS = {
    /* pre-versions shape */
    0: payload => ({ v: 1, level: payload.level || 0, unlocked: payload.unlocked || [] }),
    /* v1 was a single shared tree. Its node ids do not exist in the per-character
       trees, so the build is dropped and refunded, but the level is kept. */
    1: payload => {
      const chars = {};
      for (const c of CHAR_IDS) chars[c] = { level: payload.level || 0, unlocked: [] };
      return { v: 2, active: DEFAULT_CHAR, chars, migratedFrom: 1 };
    }
  };

  function migrate(payload) {
    let p = payload, guard = 0;
    while ((p.v || 0) < SAVE_VERSION && guard++ < 16) {
      const step = MIGRATIONS[p.v || 0];
      if (!step) return null;
      p = step(p);
    }
    return p;
  }

  function save(state) {
    try {
      const chars = {};
      for (const c in state.chars) chars[c] = { level: state.chars[c].level, unlocked: state.chars[c].unlocked };
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, active: state.active, chars }));
    } catch (e) { /* private mode, quota, blocked storage: the tree still works in memory */ }
    return state;
  }

  /* Never throws. Unknown ids mean the tree changed under the player: drop that
     character's build and hand every point back. */
  function load() {
    const state = createState();
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return state; }
    if (!raw) return state;

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { return state; }
    if (!payload || typeof payload !== 'object') return state;

    payload = migrate(payload);
    if (!payload) return state;

    if (payload.active && TREES[payload.active]) state.active = payload.active;
    const refunded = [];

    const savedChars = (payload.chars && typeof payload.chars === 'object') ? payload.chars : {};
    for (const charId of CHAR_IDS) {
      const saved = savedChars[charId];
      if (!saved) continue;
      const b = bucket(state, charId);
      b.level = Math.max(0, Math.floor(saved.level || 0));

      const list = Array.isArray(saved.unlocked) ? saved.unlocked : [];
      const idx = INDEX[charId];
      if (list.some(id => !idx.byId[id])) {
        refunded.push.apply(refunded, list.filter(id => !idx.byId[id]));
        b.unlocked = [];
        continue;
      }
      // keep only what the rules still allow, in save order
      const rebuilt = [];
      const probe = { version: SAVE_VERSION, active: charId, chars: { [charId]: { level: b.level, unlocked: rebuilt } } };
      for (const id of list) if (canUnlock(id, probe).ok) rebuilt.push(id);
      if (rebuilt.length !== list.length) refunded.push.apply(refunded, list.filter(id => rebuilt.indexOf(id) === -1));
      b.unlocked = rebuilt;
    }

    if (refunded.length) { state.refunded = refunded; save(state); }
    if (payload.migratedFrom) state.migratedFrom = payload.migratedFrom;
    state.compiled = recomputeStats(state);
    return state;
  }

  return {
    // data passthrough
    TREES, INDEX, CHAR_IDS, DEFAULT_CHAR, STAT_BASE, TIER_COST, FLAGS,
    COLS: DATA.COLS, TIER_LABEL: DATA.TIER_LABEL, SAVE_KEY, SAVE_VERSION,
    // active tree helpers
    activeTree: tree, nodeFor,
    // rules
    canUnlock, nodeStatus, unlock, reset,
    // points
    grantPoints, pointsForLevel, costOf, pointsLeft, pointsSpent, pointsTotal,
    // compilation
    recomputeStats, archetypeCounts, dominantArchetype,
    // state
    createState, setCharacter, save, load, has
  };
});
