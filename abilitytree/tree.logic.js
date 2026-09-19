/* ============================================================
   ability tree - LOGIC
   Pure rules + compilation + persistence. Never touches the DOM
   and never touches game code: the game reads compiled stats only.
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

  const { NODES, ARCHETYPES, STAT_BASE, TIER_COST } = DATA;

  const BY_ID = Object.create(null);
  for (const n of NODES) BY_ID[n.id] = n;

  /* children are derived from parents - connections are never hand-authored */
  const CHILDREN = Object.create(null);
  for (const n of NODES) {
    for (const p of (n.parents || [])) (CHILDREN[p] || (CHILDREN[p] = [])).push(n.id);
  }

  /* blocks are treated as mutual: if A lists B, taking either locks the other */
  const BLOCKED_BY = Object.create(null);
  const addBlock = (a, b) => {
    const list = BLOCKED_BY[a] || (BLOCKED_BY[a] = []);
    if (list.indexOf(b) === -1) list.push(b);      // a pair that lists each other must not double up
  };
  for (const n of NODES) {
    for (const b of (n.blocks || [])) { addBlock(b, n.id); addBlock(n.id, b); }
  }

  const SAVE_KEY = 'neon.abilityTree';
  const SAVE_VERSION = 1;

  /* ---------------- points ---------------- */

  /* the single hook the game calls. One point per level, a bonus every fifth. */
  function pointsForLevel(level) {
    const l = Math.max(0, Math.floor(level || 0));
    return l + Math.floor(l / 5);
  }

  function costOf(nodeOrId) {
    const n = typeof nodeOrId === 'string' ? BY_ID[nodeOrId] : nodeOrId;
    return n ? (TIER_COST[n.tier] || 1) : 0;
  }

  /* ---------------- state ---------------- */
  function createState() {
    const s = { version: SAVE_VERSION, level: 0, unlocked: [], compiled: null };
    s.compiled = recomputeStats(s);
    return s;
  }

  const has = (state, id) => state.unlocked.indexOf(id) !== -1;
  const pointsSpent = state => state.unlocked.reduce((sum, id) => sum + costOf(id), 0);
  const pointsTotal = state => pointsForLevel(state.level);
  const pointsLeft = state => pointsTotal(state) - pointsSpent(state);

  /* grants points by raising the recorded level; replaying old levels grants nothing */
  function grantPoints(state, level) {
    const before = pointsTotal(state);
    state.level = Math.max(state.level || 0, Math.floor(level || 0));
    const gained = pointsTotal(state) - before;
    if (gained > 0) state.compiled = recomputeStats(state);
    return gained;
  }

  function archetypeCounts(state) {
    const counts = {};
    for (const key in ARCHETYPES) counts[key] = 0;
    for (const id of state.unlocked) {
      const n = BY_ID[id];
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
    const node = BY_ID[nodeId];
    if (!node) return { ok: false, reasons: ['Unknown node: ' + nodeId] };

    const reasons = [];

    if (has(state, nodeId)) return { ok: false, reasons: ['Already unlocked'] };

    const cost = costOf(node);
    const left = pointsLeft(state);
    if (left < cost) reasons.push('Needs ' + cost + ' point' + (cost === 1 ? '' : 's') + ', you have ' + left);

    const parents = node.parents || [];
    if (parents.length && !parents.some(p => has(state, p))) {
      const names = parents.map(p => (BY_ID[p] ? BY_ID[p].name : p));
      reasons.push('Requires ' + (names.length > 1 ? 'one of: ' : '') + names.join(' or '));
    }

    for (const other of (BLOCKED_BY[nodeId] || [])) {
      if (has(state, other)) {
        reasons.push('Locked out by ' + (BY_ID[other] ? BY_ID[other].name : other));
      }
    }

    const reqs = node.reqs || {};
    if (reqs.archetypeMin) {
      const { name, count } = reqs.archetypeMin;
      const have = archetypeCounts(state)[name] || 0;
      if (have < count) {
        const label = ARCHETYPES[name] ? ARCHETYPES[name].name : name;
        reasons.push('Requires ' + count + ' ' + label + ' nodes (you have ' + have + ')');
      }
    }
    if (reqs.pointsSpentMin) {
      const spent = pointsSpent(state);
      if (spent < reqs.pointsSpentMin) {
        reasons.push('Requires ' + reqs.pointsSpentMin + ' points spent in the tree (you have ' + spent + ')');
      }
    }

    return { ok: reasons.length === 0, reasons };
  }

  /* purely for painting: what does this node look like right now */
  function nodeStatus(nodeId, state) {
    if (has(state, nodeId)) return 'unlocked';
    for (const other of (BLOCKED_BY[nodeId] || [])) if (has(state, other)) return 'blocked';
    const check = canUnlock(nodeId, state);
    if (check.ok) return 'reachable';
    // a node whose only problem is points is still worth showing as "almost"
    const node = BY_ID[nodeId];
    const parents = node.parents || [];
    const parentOk = !parents.length || parents.some(p => has(state, p));
    return parentOk ? 'available' : 'locked';
  }

  function unlock(nodeId, state) {
    const check = canUnlock(nodeId, state);
    if (!check.ok) return { ok: false, reasons: check.reasons, state };
    state.unlocked.push(nodeId);
    state.compiled = recomputeStats(state);
    save(state);
    return { ok: true, reasons: [], state };
  }

  function reset(state) {
    state.unlocked = [];
    state.compiled = recomputeStats(state);
    save(state);
    return state;
  }

  /* ---------------- compilation ---------------- */
  /* additive first, then multiplicative. flags into a Set. */
  function recomputeStats(state) {
    const add = Object.create(null);
    const mult = Object.create(null);
    const flags = new Set();

    for (const id of state.unlocked) {
      const node = BY_ID[id];
      if (!node) continue;                       // defensive: unknown ids are dropped on load
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

    const counts = archetypeCounts(state);
    return {
      stats,
      flags,
      archetypeCounts: counts,
      dominant: dominantArchetype(counts),
      pointsTotal: pointsTotal(state),
      pointsSpent: pointsSpent(state),
      pointsLeft: pointsLeft(state),
      level: state.level
    };
  }

  /* ---------------- persistence ---------------- */
  const MIGRATIONS = {
    /* 0: raw shape before versions existed. Add future steps as `n: payload => payload`. */
    0: function (payload) {
      return { v: 1, level: payload.level || 0, unlocked: payload.unlocked || [] };
    }
  };

  function migrate(payload) {
    let p = payload;
    let guard = 0;
    while ((p.v || 0) < SAVE_VERSION && guard++ < 16) {
      const step = MIGRATIONS[p.v || 0];
      if (!step) return null;                    // no path forward: caller starts fresh
      p = step(p);
    }
    return p;
  }

  function save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: SAVE_VERSION, level: state.level, unlocked: state.unlocked
      }));
    } catch (e) { /* private mode, quota, blocked storage: the tree still works in memory */ }
    return state;
  }

  /* Never throws. Unknown ids in the save mean the tree changed under the player:
     drop the build and hand every point back. */
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

    state.level = Math.max(0, Math.floor(payload.level || 0));

    const saved = Array.isArray(payload.unlocked) ? payload.unlocked : [];
    const unknown = saved.filter(id => !BY_ID[id]);
    if (unknown.length) {
      state.refunded = unknown;                  // surfaced so the UI can say why
      state.unlocked = [];
      save(state);
    } else {
      // keep only what the rules still allow, in save order
      const rebuilt = [];
      const probe = { version: SAVE_VERSION, level: state.level, unlocked: rebuilt, compiled: null };
      for (const id of saved) {
        if (canUnlock(id, probe).ok) rebuilt.push(id);
      }
      state.unlocked = rebuilt;
      if (rebuilt.length !== saved.length) { state.refunded = saved.filter(id => rebuilt.indexOf(id) === -1); save(state); }
    }

    state.compiled = recomputeStats(state);
    return state;
  }

  return {
    // data passthrough
    NODES, BY_ID, CHILDREN, ARCHETYPES, STAT_BASE, TIER_COST, COLS: DATA.COLS, TIER_LABEL: DATA.TIER_LABEL,
    SAVE_KEY, SAVE_VERSION,
    // rules
    canUnlock, nodeStatus, unlock, reset,
    // points
    grantPoints, pointsForLevel, costOf, pointsLeft, pointsSpent, pointsTotal,
    // compilation
    recomputeStats, archetypeCounts, dominantArchetype,
    // state
    createState, save, load, has
  };
});
