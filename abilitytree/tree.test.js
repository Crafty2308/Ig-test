/* ============================================================
   ability tree - console assertions
   node tree.test.js      (or load it last in a browser page)
   ============================================================ */
(function (root, factory) {
  const T = (typeof module !== 'undefined' && module.exports) ? require('./tree.logic.js') : root.AbilityTree;
  factory(T);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
  'use strict';

  /* a localStorage stub so persistence is testable off-browser */
  if (typeof localStorage === 'undefined') {
    const mem = Object.create(null);
    globalThis.localStorage = {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; }
    };
  }

  let pass = 0; const fails = [];
  function ok(cond, label) { if (cond) pass++; else fails.push(label); }
  function eq(a, b, label) { const good = Math.abs(a - b) < 1e-9; if (!good) fails.push(label + ' (got ' + a + ', want ' + b + ')'); else pass++; }

  const fresh = (level) => { const s = T.createState(); T.grantPoints(s, level || 0); return s; };
  const take = (s, ids) => { for (const id of ids) T.unlock(id, s); return s; };

  /* ---------- 1. data integrity ---------- */
  const ids = new Set(T.NODES.map(n => n.id));
  ok(ids.size === T.NODES.length, 'node ids are unique');
  for (const n of T.NODES) {
    for (const p of (n.parents || [])) ok(ids.has(p), n.id + ' parent "' + p + '" exists');
    for (const b of (n.blocks || [])) ok(ids.has(b), n.id + ' blocks "' + b + '" exists');
    if (n.tier === 'yellow' || n.tier === 'red') ok(!!n.archetype, n.id + ' (' + n.tier + ') has an archetype');
    ok(['white', 'yellow', 'red'].includes(n.tier), n.id + ' has a valid tier');
    ok(Number.isInteger(n.col) && Number.isInteger(n.row), n.id + ' sits on the grid');
  }
  const cells = new Set(T.NODES.map(n => n.col + ',' + n.row));
  ok(cells.size === T.NODES.length, 'no two nodes share a grid cell');
  const roots = T.NODES.filter(n => !n.parents || !n.parents.length);
  ok(roots.length === 1 && roots[0].id === 'core', 'exactly one root');

  const redsPer = {};
  for (const n of T.NODES) if (n.tier === 'red') redsPer[n.archetype] = (redsPer[n.archetype] || 0) + 1;
  for (const a in T.ARCHETYPES) eq(redsPer[a] || 0, 3, 'archetype ' + a + ' has 3 red nodes');

  /* every node must be reachable from the root by parent edges */
  const seen = new Set(['core']);
  for (let pass2 = 0; pass2 < T.NODES.length; pass2++) {
    for (const n of T.NODES) if (!seen.has(n.id) && (n.parents || []).some(p => seen.has(p))) seen.add(n.id);
  }
  ok(seen.size === T.NODES.length, 'every node is reachable from the root (' + seen.size + '/' + T.NODES.length + ')');

  /* no cycles: parents must always point at a strictly earlier row */
  let cyclic = 0;
  for (const n of T.NODES) for (const p of (n.parents || [])) if (T.BY_ID[p].row >= n.row) cyclic++;
  eq(cyclic, 0, 'parent edges always go down a row (acyclic)');

  /* ---------- 2. costs and points ---------- */
  eq(T.costOf('core'), 1, 'white costs 1');
  eq(T.costOf('ons_y1'), 2, 'yellow costs 2');
  eq(T.costOf('cap_ons'), 4, 'red costs 4');
  eq(T.pointsForLevel(0), 0, 'level 0 grants nothing');
  eq(T.pointsForLevel(1), 1, 'level 1 grants 1');
  eq(T.pointsForLevel(10), 12, 'level 10 grants 12');

  const gp = T.createState();
  eq(T.grantPoints(gp, 5), 6, 'grantPoints returns the gain');
  eq(T.grantPoints(gp, 3), 0, 'replaying a lower level grants nothing');
  eq(T.grantPoints(gp, 6), 1, 'a new highest level grants the difference');

  /* ---------- 3. canUnlock ---------- */
  const s0 = T.createState();
  ok(!T.canUnlock('core', s0).ok, 'root refused with zero points');
  ok(T.canUnlock('core', s0).reasons.some(r => /point/i.test(r)), 'refusal names the points problem');

  const s1 = fresh(4);
  ok(T.canUnlock('core', s1).ok, 'root unlockable with points');
  ok(!T.canUnlock('ons_2', s1).ok, 'orphan child refused');
  ok(T.canUnlock('ons_2', s1).reasons.some(r => /Requires/.test(r)), 'refusal names the parent');
  T.unlock('core', s1);
  ok(T.canUnlock('ons_1', s1).ok, 'child unlockable once its parent is taken');
  ok(!T.canUnlock('core', s1).ok && T.canUnlock('core', s1).reasons[0] === 'Already unlocked', 'already-unlocked is reported');
  ok(!T.canUnlock('does_not_exist', s1).ok, 'unknown id never throws');

  /* multi-parent: either parent is enough */
  const s2 = take(fresh(20), ['core', 'ons_1', 'ons_2']);
  ok(T.canUnlock('ons_y1', s2).ok, 'multi-parent node accepts one satisfied parent');

  /* archetype gate */
  const s3 = take(fresh(20), ['core', 'dom_1', 'dom_2']);
  ok(!T.canUnlock('dom_y1', s3).ok === false, 'dominion gate met with 2 dominion nodes');
  const s4 = take(fresh(20), ['core', 'dom_1']);
  const gate = T.canUnlock('dom_y1', s4);
  ok(!gate.ok, 'archetype gate refuses at 1 of 2');
  ok(gate.reasons.some(r => /Dominion nodes/.test(r)), 'gate refusal names the archetype and count');

  /* pointsSpentMin gate */
  const s5 = fresh(40);
  take(s5, ['core', 'ons_1', 'ons_2', 'ons_3', 'ons_y1', 'ons_4', 'ons_5']);
  ok(T.canUnlock('ons_r1', s5).ok, 'red opens once its archetype and spend gates are met');

  /* ---------- 4. blocks are mutual and permanent until reset ---------- */
  const s6 = fresh(40);
  take(s6, ['core', 'ons_1', 'ons_2', 'ons_3', 'ons_y1', 'ons_4', 'ons_5', 'ons_r1']);
  ok(T.has(s6, 'ons_r1'), 'first half of the exclusive pair taken');
  const blocked = T.canUnlock('ons_r2', s6);
  ok(!blocked.ok, 'its exclusive twin is refused');
  ok(blocked.reasons.some(r => /Locked out by/.test(r)), 'refusal explains the lockout');
  ok(T.nodeStatus('ons_r2', s6) === 'blocked', 'status paints as blocked');
  T.reset(s6);
  ok(T.canUnlock('core', s6).ok, 'reset refunds everything');
  eq(T.pointsSpent(s6), 0, 'nothing is spent after a reset');

  /* ---------- 5. compilation: additive first, then multiplicative ---------- */
  const s7 = take(fresh(40), ['core', 'ons_1', 'ons_2']);
  // damage: base 1 * 1.04 (core) * 1.08 (ons_2) ; fireRate: 1 * 1.06
  eq(s7.compiled.stats.damage, 1 * 1.04 * 1.08, 'damage multiplies in order');
  eq(s7.compiled.stats.fireRate, 1.06, 'fireRate multiplies');
  eq(s7.compiled.stats.critChance, 0, 'untouched stats keep their base');

  const s8 = take(fresh(60), ['core', 'dom_1', 'dom_2', 'dom_3', 'dom_y1', 'dom_4']);
  // slowPower is additive: 0.12 + 0.10? (dom_1 .12, dom_4 .14) -> 0.26, no multipliers
  eq(s8.compiled.stats.slowPower, 0.26, 'additive stats sum');
  ok(s8.compiled.flags.has('staticWeb'), 'flags land in the Set');
  eq(s8.compiled.stats.chainCount, 1, 'chainCount added by the yellow');

  /* a node with both add and mult on the same stat applies add first */
  const probe = { version: 1, level: 99, unlocked: [], compiled: null };
  const mixed = T.recomputeStats({ level: 99, unlocked: ['hub', 'cap_ons'] });
  // maxHp: (0 + 25 + -25) * 1 = 0
  eq(mixed.stats.maxHp, 0, 'maxHp adds then multiplies');
  ok(mixed.flags.has('annihilation'), 'capstone flag compiles');

  /* ---------- 6. archetype counts and dominance ---------- */
  eq(s8.compiled.archetypeCounts.dominion, 5, 'dominion count tracked');
  eq(s8.compiled.archetypeCounts.onslaught, 0, 'other archetypes stay at zero');
  ok(s8.compiled.dominant === 'dominion', 'dominant archetype exposed');
  const tie = take(fresh(40), ['core', 'ons_1', 'dom_1']);
  ok(tie.compiled.dominant === null, 'a tie has no dominant archetype');
  ok(T.createState().compiled.dominant === null, 'an empty tree has no dominant archetype');

  /* ---------- 7. capstones are mutually exclusive ---------- */
  const full = fresh(60);
  take(full, ['core', 'ons_1', 'ons_2', 'ons_3', 'ons_y1', 'ons_4', 'ons_5', 'ons_r1',
              'hub', 'ons_y2', 'ons_6', 'ons_y3', 'ons_y4', 'cap_ons']);
  ok(T.has(full, 'cap_ons'), 'onslaught capstone reachable by committing to one archetype');
  ok(!T.canUnlock('cap_dom', full).ok, 'dominion capstone locked out');
  ok(!T.canUnlock('cap_kin', full).ok, 'kinesis capstone locked out');
  ok(full.compiled.dominant === 'onslaught', 'capstone build is dominantly onslaught');

  /* a grazer cannot reach any capstone */
  const grazer = fresh(60);
  take(grazer, ['core', 'ons_1', 'dom_1', 'kin_1', 'ons_2', 'dom_2', 'kin_2', 'ons_3', 'dom_3', 'kin_3']);
  ok(!T.canUnlock('cap_ons', grazer).ok && !T.canUnlock('cap_dom', grazer).ok, 'spreading thin reaches no capstone');

  /* ---------- 8. persistence ---------- */
  localStorage.removeItem(T.SAVE_KEY);
  const sp = fresh(20);
  take(sp, ['core', 'ons_1', 'ons_2']);
  const loaded = T.load();
  eq(loaded.unlocked.length, 3, 'save/load round-trips the build');
  eq(loaded.level, 20, 'save/load round-trips the level');
  ok(loaded.compiled.stats.damage === sp.compiled.stats.damage, 'loaded stats match');

  /* unknown ids: refund and reset, never throw */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ v: 1, level: 12, unlocked: ['core', 'ghost_node'] }));
  const ghosted = T.load();
  eq(ghosted.unlocked.length, 0, 'unknown saved id wipes the build');
  eq(T.pointsLeft(ghosted), T.pointsForLevel(12), 'every point is refunded');
  ok(Array.isArray(ghosted.refunded) && ghosted.refunded.indexOf('ghost_node') !== -1, 'the refund reports which id was unknown');

  /* a save that no longer satisfies the rules is trimmed, not crashed on */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ v: 1, level: 2, unlocked: ['core', 'ons_1', 'ons_2', 'ons_3'] }));
  const trimmed = T.load();
  ok(trimmed.unlocked.length < 4, 'an over-spent save is trimmed to what the points allow');
  ok(T.pointsLeft(trimmed) >= 0, 'never loads into negative points');

  /* garbage in storage */
  localStorage.setItem(T.SAVE_KEY, '{not json');
  ok(T.load().unlocked.length === 0, 'corrupt save loads as a fresh tree');
  localStorage.setItem(T.SAVE_KEY, 'null');
  ok(T.load().unlocked.length === 0, 'null save loads as a fresh tree');

  /* migration stub: a v0 payload is upgraded, not discarded */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ level: 9, unlocked: ['core'] }));
  const migrated = T.load();
  eq(migrated.unlocked.length, 1, 'v0 save migrates forward');
  eq(migrated.level, 9, 'v0 level survives migration');
  localStorage.removeItem(T.SAVE_KEY);

  /* ---------- report ---------- */
  const line = 'ability tree: ' + pass + ' assertions passed, ' + fails.length + ' failed';
  if (fails.length) {
    console.error(line);
    for (const f of fails) console.error('  FAIL ' + f);
    if (typeof process !== 'undefined' && process.exit) process.exit(1);
  } else {
    console.log(line);
  }
  return { pass, fails };
});
