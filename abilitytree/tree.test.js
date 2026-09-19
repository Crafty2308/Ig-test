/* ============================================================
   ability tree - console assertions
   node tree.test.js      (or load it last in a browser page)
   ============================================================ */
(function (root, factory) {
  const T = (typeof module !== 'undefined' && module.exports) ? require('./tree.logic.js') : root.AbilityTree;
  factory(T);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
  'use strict';

  if (typeof localStorage === 'undefined') {
    const mem = Object.create(null);
    globalThis.localStorage = {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; }
    };
  }

  let pass = 0; const fails = [];
  const ok = (cond, label) => { if (cond) pass++; else fails.push(label); };
  const eq = (a, b, label) => { if (Math.abs(a - b) < 1e-9) pass++; else fails.push(label + ' (got ' + a + ', want ' + b + ')'); };

  const fresh = (charId, level) => {
    const s = T.createState(charId);
    T.grantPoints(s, level || 0);
    return s;
  };
  const take = (s, ids) => { for (const id of ids) T.unlock(id, s); return s; };
  /* buys a whole archetype lane in dependency order, choosing one side of the red pair */
  function laneIds(charId, archId, rightRed) {
    const nodes = T.INDEX[charId].nodes.filter(n => n.archetype === archId).sort((a, b) => a.row - b.row || a.col - b.col);
    const reds = nodes.filter(n => n.tier === 'red' && n.row === 5);
    const skip = rightRed ? reds[0].id : reds[1].id;
    return [charId + '_root'].concat(nodes.filter(n => n.id !== skip).map(n => n.id));
  }

  /* ---------- 1. every tree is structurally sound ---------- */
  const allIds = new Set();
  const statKeys = new Set(Object.keys(T.STAT_BASE));
  const flagSet = new Set(T.FLAGS);

  eq(T.CHAR_IDS.length, 10, 'ten characters have trees');

  for (const charId of T.CHAR_IDS) {
    const idx = T.INDEX[charId];
    const nodes = idx.nodes;
    const label = charId + ': ';

    for (const n of nodes) {
      ok(!allIds.has(n.id), label + n.id + ' id is globally unique');
      allIds.add(n.id);
      ok(['white', 'yellow', 'red'].includes(n.tier), label + n.id + ' has a valid tier');
      ok(Number.isInteger(n.col) && Number.isInteger(n.row), label + n.id + ' sits on the grid');
      for (const p of (n.parents || [])) ok(!!idx.byId[p], label + n.id + ' parent ' + p + ' exists in this tree');
      for (const b of (n.blocks || [])) ok(!!idx.byId[b], label + n.id + ' blocks ' + b + ' in this tree');
      if (n.tier !== 'white') ok(!!n.archetype, label + n.id + ' (' + n.tier + ') belongs to an archetype');
      if (n.archetype) ok(!!idx.archetypes[n.archetype], label + n.id + ' archetype is declared');
      const effs = n.effects || (n.effect ? [n.effect] : []);
      ok(effs.length > 0, label + n.id + ' does something');
      for (const e of effs) {
        if (e.flag) ok(flagSet.has(e.flag), label + n.id + ' flag "' + e.flag + '" is in FLAGS');
        else {
          ok(statKeys.has(e.stat), label + n.id + ' stat "' + e.stat + '" is in STAT_BASE');
          ok(e.op === 'add' || e.op === 'mult', label + n.id + ' op is add or mult');
          ok(typeof e.value === 'number', label + n.id + ' value is numeric');
        }
      }
    }

    const cells = new Set(nodes.map(n => n.col + ',' + n.row));
    eq(cells.size, nodes.length, label + 'no two nodes share a cell');

    const roots = nodes.filter(n => !n.parents || !n.parents.length);
    ok(roots.length === 1 && roots[0].id === charId + '_root', label + 'exactly one root');

    /* tier spread: white is most of the tree */
    const tiers = { white: 0, yellow: 0, red: 0 };
    for (const n of nodes) tiers[n.tier]++;
    ok(tiers.white > tiers.yellow + tiers.red, label + 'white nodes are most of the tree');

    /* reds: 3 per archetype */
    const reds = {};
    for (const n of nodes) if (n.tier === 'red') reds[n.archetype] = (reds[n.archetype] || 0) + 1;
    eq(Object.keys(idx.archetypes).length, 3, label + 'three archetypes');
    for (const a in idx.archetypes) eq(reds[a] || 0, 3, label + a + ' has 3 red nodes');

    /* every yellow and red is gated on its own archetype */
    for (const n of nodes) {
      if (n.tier === 'white') continue;
      ok(n.reqs && n.reqs.archetypeMin && n.reqs.archetypeMin.name === n.archetype,
         label + n.id + ' is gated on its own archetype');
    }

    /* reachability and acyclicity */
    const seen = new Set([charId + '_root']);
    for (let i = 0; i < nodes.length; i++) {
      for (const n of nodes) if (!seen.has(n.id) && (n.parents || []).some(p => seen.has(p))) seen.add(n.id);
    }
    eq(seen.size, nodes.length, label + 'every node is reachable from the root');
    let cyclic = 0;
    for (const n of nodes) for (const p of (n.parents || [])) if (idx.byId[p].row >= n.row) cyclic++;
    eq(cyclic, 0, label + 'parent edges always go down a row');

    /* capstones: one per archetype, each blocking the other two */
    const caps = nodes.filter(n => n.capstone);
    eq(caps.length, 3, label + 'three capstones');
    for (const c of caps) eq((c.blocks || []).length, 2, label + c.id + ' blocks the other two capstones');

    /* one mutually exclusive red pair per archetype */
    for (const a in idx.archetypes) {
      const pair = nodes.filter(n => n.archetype === a && n.tier === 'red' && n.row === 5);
      eq(pair.length, 2, label + a + ' has an exclusive red pair');
      ok(pair[0].blocks.includes(pair[1].id) && pair[1].blocks.includes(pair[0].id), label + a + ' pair blocks both ways');
    }
  }

  /* ---------- 2. costs and points ---------- */
  eq(T.costOf('vanguard_plate'), 1, 'white costs 1');
  eq(T.costOf('vanguard_hardlight'), 2, 'yellow costs 2');
  eq(T.costOf('vanguard_immovable'), 4, 'red costs 4');
  eq(T.pointsForLevel(0), 0, 'level 0 grants nothing');
  eq(T.pointsForLevel(10), 12, 'level 10 grants 12');

  const gp = T.createState('vanguard');
  eq(T.grantPoints(gp, 5), 6, 'grantPoints returns the gain');
  eq(T.grantPoints(gp, 3), 0, 'replaying a lower level grants nothing');

  /* points are banked per character */
  const perChar = T.createState('vanguard');
  T.grantPoints(perChar, 12);
  eq(T.pointsLeft(perChar), T.pointsForLevel(12), 'the played character has points');
  eq(T.pointsLeft(perChar, 'nyx'), 0, 'another character has none');
  T.setCharacter(perChar, 'nyx');
  eq(perChar.compiled.pointsLeft, 0, 'switching characters switches the point pool');
  ok(perChar.compiled.charId === 'nyx', 'compiled state names its character');

  /* ---------- 3. canUnlock ---------- */
  const s0 = T.createState('vanguard');
  ok(!T.canUnlock('vanguard_root', s0).ok, 'root refused with zero points');
  const s1 = fresh('vanguard', 4);
  ok(T.canUnlock('vanguard_root', s1).ok, 'root unlockable with points');
  ok(!T.canUnlock('vanguard_cell', s1).ok, 'orphan child refused');
  ok(T.canUnlock('vanguard_cell', s1).reasons.some(r => /Requires/.test(r)), 'refusal names the parent');
  T.unlock('vanguard_root', s1);
  ok(T.canUnlock('vanguard_plate', s1).ok, 'child unlockable once its parent is taken');
  ok(T.canUnlock('vanguard_root', s1).reasons[0] === 'Already unlocked', 'already-unlocked is reported');
  ok(!T.canUnlock('nyx_light', s1).ok, "another character's node is not in this tree");
  ok(!T.canUnlock('nope', s1).ok, 'unknown id never throws');

  /* archetype gate */
  const s3 = take(fresh('vanguard', 20), ['vanguard_root', 'vanguard_plate']);
  const gate = T.canUnlock('vanguard_hardlight', s3);
  ok(!gate.ok, 'archetype gate refuses at 1 of 2');
  ok(gate.reasons.some(r => /Bulwark abilities/.test(r)), 'gate refusal names the archetype and count');
  T.unlock('vanguard_cell', s3);
  ok(T.canUnlock('vanguard_hardlight', s3).ok, 'gate opens at 2');

  /* multi-parent: either parent is enough */
  ok(T.INDEX.vanguard.byId.vanguard_hardlight.parents.length === 2, 'the gate node has two parents');

  /* ---------- 4. blocks are mutual and permanent until reset ---------- */
  const s6 = take(fresh('vanguard', 30), laneIds('vanguard', 'bulwark', false).slice(0, 8));
  ok(T.has(s6, 'vanguard_overshield'), 'one half of the exclusive pair taken');
  const blocked = T.canUnlock('vanguard_siege', s6);
  ok(!blocked.ok, 'its exclusive twin is refused');
  ok(blocked.reasons.some(r => /Locked out by/.test(r)), 'refusal explains the lockout');
  eq(blocked.reasons.filter(r => /Locked out by/.test(r)).length, 1, 'the lockout is reported once, not twice');
  ok(T.nodeStatus('vanguard_siege', s6) === 'blocked', 'status paints as blocked');
  T.reset(s6);
  eq(T.pointsSpent(s6), 0, 'reset refunds everything');
  ok(T.canUnlock('vanguard_siege', s6).ok === false, 'after a reset the twin still needs its parents');

  /* ---------- 5. compilation: additive first, then multiplicative ---------- */
  const s7 = take(fresh('vanguard', 30), ['vanguard_root', 'vanguard_plate', 'vanguard_cell']);
  eq(s7.compiled.stats.damage, 1.04, 'root multiplier applies');
  eq(s7.compiled.stats.maxHp, 20, 'additive stat sums');
  eq(s7.compiled.stats.shield, 25, 'a second additive stat sums');
  eq(s7.compiled.stats.critChance, 0, 'untouched stats keep their base');

  const mixed = T.recomputeStats({ active: 'vanguard', chars: { vanguard: { level: 99, unlocked: ['vanguard_root', 'vanguard_counter', 'vanguard_vengeance'] } } });
  eq(mixed.stats.damage, 1.04 * 1.06 * 1.08, 'multipliers compose');

  const flagged = take(fresh('cinder', 30), ['cinder_root', 'cinder_pilot']);
  ok(flagged.compiled.flags.has('immolate'), 'flags land in the Set');
  eq(flagged.compiled.stats.burnDamage, 2, 'the root grants burn damage');

  /* ---------- 6. archetype counts and dominance ---------- */
  eq(s7.compiled.archetypeCounts.bulwark, 2, 'archetype count tracked');
  eq(s7.compiled.archetypeCounts.suppression, 0, 'other archetypes stay at zero');
  ok(s7.compiled.dominant === 'bulwark', 'dominant archetype exposed');
  const tie = take(fresh('vanguard', 30), ['vanguard_root', 'vanguard_plate', 'vanguard_spikes']);
  ok(tie.compiled.dominant === null, 'a tie has no dominant archetype');
  ok(T.createState('vanguard').compiled.dominant === null, 'an empty tree has no dominant archetype');

  /* ---------- 7. capstones: reachable by commitment, exclusive to each other ---------- */
  for (const charId of T.CHAR_IDS) {
    const idx = T.INDEX[charId];
    const archIds = Object.keys(idx.archetypes);
    const s = fresh(charId, 40);
    take(s, laneIds(charId, archIds[0], false));
    const cap = idx.nodes.find(n => n.capstone && n.archetype === archIds[0]);
    ok(T.has(s, cap.id), charId + ': ' + archIds[0] + ' capstone reachable by committing to that lane');
    for (const other of archIds.slice(1)) {
      const oc = idx.nodes.find(n => n.capstone && n.archetype === other);
      ok(!T.canUnlock(oc.id, s).ok, charId + ': ' + other + ' capstone locked out');
    }
    ok(s.compiled.dominant === archIds[0], charId + ': committed build has the expected dominant archetype');
  }

  /* a grazer reaches no capstone */
  const grazer = fresh('vanguard', 40);
  take(grazer, ['vanguard_root', 'vanguard_plate', 'vanguard_spikes', 'vanguard_trigger',
                'vanguard_cell', 'vanguard_counter', 'vanguard_belt']);
  const anyCap = T.INDEX.vanguard.nodes.filter(n => n.capstone).some(n => T.canUnlock(n.id, grazer).ok);
  ok(!anyCap, 'spreading across archetypes reaches no capstone');

  /* ---------- 8. persistence ---------- */
  localStorage.removeItem(T.SAVE_KEY);
  const sp = fresh('vanguard', 20);
  take(sp, ['vanguard_root', 'vanguard_plate']);
  T.grantPoints(sp, 9, 'nyx');
  T.save(sp);
  const loaded = T.load();
  eq(loaded.chars.vanguard.unlocked.length, 2, 'save/load round-trips the build');
  eq(loaded.chars.vanguard.level, 20, 'save/load round-trips the level');
  eq(loaded.chars.nyx.level, 9, 'other characters keep their own level');
  ok(loaded.active === 'vanguard', 'the active character is remembered');

  /* unknown ids: refund and reset that character, never throw */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ v: 2, active: 'vanguard',
    chars: { vanguard: { level: 12, unlocked: ['vanguard_root', 'ghost_node'] }, nyx: { level: 4, unlocked: [] } } }));
  const ghosted = T.load();
  eq(ghosted.chars.vanguard.unlocked.length, 0, 'unknown saved id wipes that build');
  eq(T.pointsLeft(ghosted), T.pointsForLevel(12), 'every point is refunded');
  eq(ghosted.chars.nyx.level, 4, 'other characters are untouched');
  ok(Array.isArray(ghosted.refunded) && ghosted.refunded.indexOf('ghost_node') !== -1, 'the refund reports the unknown id');

  /* an over-spent save is trimmed */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ v: 2, active: 'vanguard',
    chars: { vanguard: { level: 1, unlocked: ['vanguard_root', 'vanguard_plate', 'vanguard_cell'] } } }));
  const trimmed = T.load();
  ok(trimmed.chars.vanguard.unlocked.length < 3, 'an over-spent save is trimmed');
  ok(T.pointsLeft(trimmed) >= 0, 'never loads into negative points');

  /* garbage */
  localStorage.setItem(T.SAVE_KEY, '{not json');
  ok(T.load().chars.vanguard.unlocked.length === 0, 'corrupt save loads as a fresh tree');
  localStorage.setItem(T.SAVE_KEY, 'null');
  ok(T.load().chars.vanguard.unlocked.length === 0, 'null save loads as a fresh tree');

  /* v1 (the old shared tree) migrates: the build is dropped, the level survives */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ v: 1, level: 14, unlocked: ['core', 'ons_1'] }));
  const migrated = T.load();
  eq(migrated.chars.vanguard.level, 14, 'v1 level survives migration');
  eq(migrated.chars.vanguard.unlocked.length, 0, 'v1 build is refunded, not crashed on');
  eq(T.pointsLeft(migrated), T.pointsForLevel(14), 'the migrated player gets every point back');

  /* v0 (pre-version) migrates too */
  localStorage.setItem(T.SAVE_KEY, JSON.stringify({ level: 7, unlocked: [] }));
  eq(T.load().chars.vanguard.level, 7, 'v0 save migrates forward');
  localStorage.removeItem(T.SAVE_KEY);

  /* ---------- report ---------- */
  const line = 'ability tree: ' + pass + ' assertions passed, ' + fails.length + ' failed  ('
    + T.CHAR_IDS.length + ' trees, ' + allIds.size + ' nodes)';
  if (fails.length) {
    console.error(line);
    for (const f of fails.slice(0, 25)) console.error('  FAIL ' + f);
    if (fails.length > 25) console.error('  ...and ' + (fails.length - 25) + ' more');
    if (typeof process !== 'undefined' && process.exit) process.exit(1);
  } else {
    console.log(line);
  }
  return { pass, fails };
});
