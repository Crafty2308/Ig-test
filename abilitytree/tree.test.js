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
  const BANNED = /\b(enhances?|improves?|empowers?|strengthens?|boosts?|better|greatly)\b/i;

  eq(T.CHAR_IDS.length, 11, 'eleven characters have trees');

  for (const charId of T.CHAR_IDS) {
    const idx = T.INDEX[charId];
    const nodes = idx.nodes;
    const label = charId + ': ';

    for (const n of nodes) {
      ok(!allIds.has(n.id), label + n.id + ' id is globally unique');
      allIds.add(n.id);
      ok(['white', 'yellow', 'red'].includes(n.tier), label + n.id + ' has a valid tier');
      ok(Number.isInteger(n.col) && Number.isInteger(n.row), label + n.id + ' sits on the grid');
      for (const p of (n.parents || [])) ok(!!idx.byId[p], label + n.id + ' parent ' + p + ' exists');
      for (const b of (n.blocks || [])) ok(!!idx.byId[b], label + n.id + ' blocks ' + b);
      const effs = n.effects || (n.effect ? [n.effect] : []);
      ok(effs.length > 0, label + n.id + ' does something');
      for (const e of effs) {
        if (e.flag) ok(flagSet.has(e.flag), label + n.id + ' flag "' + e.flag + '" is declared');
        else {
          ok(statKeys.has(e.stat), label + n.id + ' stat "' + e.stat + '" is declared');
          ok(e.op === 'add' || e.op === 'mult', label + n.id + ' op is add or mult');
          ok(typeof e.value === 'number', label + n.id + ' value is numeric');
        }
      }
      /* description rules: numbers, no vague verbs, real sentences */
      ok(/\d/.test(n.desc), label + n.id + ' description states a number');
      ok(!BANNED.test(n.desc), label + n.id + ' description avoids vague verbs');
      ok(n.desc.length >= 10, label + n.id + ' description says something concrete');
      ok(/[.!]$/.test(n.desc.trim()), label + n.id + ' description is punctuated');
    }

    const cells = new Set(nodes.map(n => n.col + ',' + n.row));
    eq(cells.size, nodes.length, label + 'no two nodes share a cell');

    const roots = nodes.filter(n => !n.parents || !n.parents.length);
    ok(roots.length === 1 && roots[0].id === charId + '_root', label + 'exactly one root');

    /* three archetypes, each with an identity and five ratings */
    eq(idx.archList.length, 3, label + 'three archetypes');
    for (const a of idx.archList) {
      ok(a.desc && a.desc.length > 150, label + a.id + ' has an identity paragraph');
      ok(!BANNED.test(a.desc), label + a.id + ' identity avoids vague verbs');
      for (const k of ['difficulty', 'damage', 'defense', 'range', 'speed']) {
        ok(['Low', 'Medium', 'High'].includes(a.ratings[k]), label + a.id + ' rates ' + k);
      }
    }

    /* three parallel lanes plus a convergence column between each pair */
    for (const a of idx.archList) {
      const lane = nodes.filter(n => n.archetype === a.id);
      eq(lane.length, 9, label + a.id + ' lane has 9 nodes');
      eq(new Set(lane.map(n => n.col)).size, 1, label + a.id + ' lane sits in one column');
    }
    const dual = nodes.filter(n => n.dual);
    eq(dual.length, 8, label + '8 convergence nodes');
    for (const d of dual) {
      eq(d.dual.length, 2, label + d.id + ' joins exactly two archetypes');
      ok(d.archetype === null, label + d.id + ' belongs to no single archetype');
      ok(d.reqs && d.reqs.archetypeMins && d.reqs.archetypeMins.length === 2,
         label + d.id + ' is gated on both archetypes');
      ok([1, 3].includes(d.col), label + d.id + ' sits between two lanes');
    }

    /* tall, not wide */
    const rows = Math.max.apply(null, nodes.map(n => n.row)) + 1;
    ok(rows >= 12, label + 'the tree is tall (' + rows + ' rows)');
    ok(Math.max.apply(null, nodes.map(n => n.col)) + 1 === 5, label + 'five grid columns');

    /* white is most of the tree */
    const tiers = { white: 0, yellow: 0, red: 0 };
    for (const n of nodes) tiers[n.tier]++;
    ok(tiers.white >= tiers.yellow && tiers.white >= tiers.red, label + 'white nodes are the bulk');

    /* reachability and acyclicity */
    const seen = new Set([charId + '_root']);
    for (let i = 0; i < nodes.length; i++) {
      for (const n of nodes) if (!seen.has(n.id) && (n.parents || []).some(p => seen.has(p))) seen.add(n.id);
    }
    eq(seen.size, nodes.length, label + 'every node is reachable from the root');
    let cyclic = 0;
    for (const n of nodes) for (const p of (n.parents || [])) if (idx.byId[p].row >= n.row) cyclic++;
    eq(cyclic, 0, label + 'parent edges always go down a row');

    /* five endings, all mutually exclusive: 3 pure capstones + 2 fusions */
    const ends = nodes.filter(n => n.capstone);
    eq(ends.length, 5, label + 'five mutually exclusive endings');
    eq(ends.filter(n => n.dual).length, 2, label + 'two of them are fusions');
    for (const c of ends) eq((c.blocks || []).length, 4, label + c.id + ' blocks the other four');
  }

  /* ---------- 2. costs and points ---------- */
  eq(T.costOf('vanguard_plate'), 1, 'white costs 1');
  eq(T.costOf('vanguard_hardlight'), 2, 'yellow costs 2');
  eq(T.costOf('vanguard_immovable'), 5, 'red costs 5');
  eq(T.pointsForLevel(0), 0, 'level 0 grants nothing');
  eq(T.pointsForLevel(10), 8, 'level 10 grants 8');
  eq(T.pointsForLevel(40), 32, 'level 40 grants 32, about a third of a tree');

  const gp = T.createState('vanguard');
  eq(T.grantPoints(gp, 5), 4, 'grantPoints returns the gain');
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
  const s3 = take(fresh('vanguard', 40), ['vanguard_root', 'vanguard_plate', 'vanguard_cell']);
  const gate = T.canUnlock('vanguard_hardlight', s3);
  ok(!gate.ok, 'archetype gate refuses at 2 of 3');
  ok(gate.reasons.some(r => /Bulwark abilities/.test(r)), 'gate refusal names the archetype and count');
  T.unlock('vanguard_coolant', s3);
  ok(T.canUnlock('vanguard_hardlight', s3).ok, 'gate opens at 3');

  /* a convergence needs BOTH neighbouring archetypes */
  const conv = T.INDEX.vanguard.nodes.find(n => n.dual && n.row === 3);
  const cv = T.canUnlock(conv.id, s3);
  ok(!cv.ok, 'convergence refused with only one archetype invested');
  ok(cv.reasons.some(r => /Retribution abilities/.test(r)), 'convergence names the second archetype');

  /* ---------- 4. endings are mutually exclusive and reset refunds ---------- */
  const pure = fresh('vanguard', 40);
  T.unlock('vanguard_root', pure);
  const bulwark = T.INDEX.vanguard.nodes.filter(n => n.archetype === 'bulwark').sort((a, b) => a.row - b.row);
  for (const n of bulwark.slice(0, 8)) T.unlock(n.id, pure);
  for (const n of T.INDEX.vanguard.nodes.filter(x => x.archetype === 'suppression').slice(0, 3)) T.unlock(n.id, pure);
  const capId = bulwark[8].id;
  ok(T.canUnlock(capId, pure).ok, 'a fully committed lane reaches its capstone');
  T.unlock(capId, pure);
  const others = T.INDEX.vanguard.nodes.filter(n => n.capstone && n.id !== capId);
  ok(others.every(n => !T.canUnlock(n.id, pure).ok), 'every other ending is locked out');
  ok(others.every(n => T.nodeStatus(n.id, pure) === 'blocked'), 'they paint as blocked');
  const lockReasons = T.canUnlock(others[0].id, pure).reasons;
  eq(lockReasons.filter(r => /Locked out by/.test(r)).length, 1, 'the lockout is reported once');
  ok(T.pointsSpent(pure) <= T.pointsTotal(pure), 'never overspends');
  T.reset(pure);
  eq(T.pointsSpent(pure), 0, 'reset refunds everything');

  /* a pure build can never reach a convergence */
  const pure2 = fresh('vanguard', 40);
  T.unlock('vanguard_root', pure2);
  for (const n of bulwark.slice(0, 8)) T.unlock(n.id, pure2);
  ok(T.INDEX.vanguard.nodes.filter(n => n.dual).every(n => !T.canUnlock(n.id, pure2).ok),
     'convergences stay shut to a single-archetype build');

  /* ---------- 5. compilation: additive first, then multiplicative ---------- */
  const s7 = take(fresh('vanguard', 30), ['vanguard_root', 'vanguard_plate', 'vanguard_cell']);
  eq(s7.compiled.stats.damage, 1.04, 'root multiplier applies');
  eq(s7.compiled.stats.maxHp, 25, 'additive stat sums');
  eq(s7.compiled.stats.shield, 30, 'a second additive stat sums');
  eq(s7.compiled.stats.critChance, 0, 'untouched stats keep their base');

  const mixed = T.recomputeStats({ active: 'vanguard', chars: { vanguard: { level: 99, unlocked: ['vanguard_root', 'vanguard_counter', 'vanguard_vengeance'] } } });
  eq(mixed.stats.damage, 1.04 * 1.07 * 1.09, 'multipliers compose');

  const flagged = take(fresh('cinder', 30), ['cinder_root', 'cinder_pilot']);
  ok(flagged.compiled.flags.has('immolate'), 'flags land in the Set');
  eq(flagged.compiled.stats.burnDamage, 2, 'the root grants burn damage');
  const beam = take(fresh('halcyon', 30), ['halcyon_root', 'halcyon_focus1']);
  eq(beam.compiled.stats.beamPower, 12, 'beam damage compiles for the beam class');

  /* ---------- 6. archetype counts and dominance ---------- */
  eq(s7.compiled.archetypeCounts.bulwark, 2, 'archetype count tracked');
  eq(s7.compiled.archetypeCounts.retribution, 0, 'convergence-free lanes stay at zero');
  eq(s7.compiled.archetypeCounts.suppression, 0, 'other archetypes stay at zero');
  ok(s7.compiled.dominant === 'bulwark', 'dominant archetype exposed');
  const tie = take(fresh('vanguard', 30), ['vanguard_root', 'vanguard_plate', 'vanguard_spikes']);
  ok(tie.compiled.dominant === null, 'a tie has no dominant archetype');
  ok(T.createState('vanguard').compiled.dominant === null, 'an empty tree has no dominant archetype');

  /* ---------- 7. every class can finish a build, pure or fused ---------- */
  for (const charId of T.CHAR_IDS) {
    const idx = T.INDEX[charId];
    const archIds = idx.archList.map(a => a.id);

    // pure: all 8 of one lane, three cheap whites elsewhere for the spend gate, then the capstone
    const s = fresh(charId, 40);
    T.unlock(charId + '_root', s);
    const lane = idx.nodes.filter(n => n.archetype === archIds[0]).sort((a, b) => a.row - b.row);
    for (const n of lane.slice(0, 8)) T.unlock(n.id, s);
    for (const n of idx.nodes.filter(x => x.archetype === archIds[2]).slice(0, 3)) T.unlock(n.id, s);
    ok(T.canUnlock(lane[8].id, s).ok, charId + ': pure ' + archIds[0] + ' build reaches its capstone');
    T.unlock(lane[8].id, s);
    ok(T.pointsSpent(s) <= T.pointsTotal(s), charId + ': pure build fits in the points a run banks');
    ok(s.compiled.dominant === archIds[0], charId + ': pure build is dominantly ' + archIds[0]);

    // fused: five of two lanes plus the convergence spine
    const f = fresh(charId, 40);
    T.unlock(charId + '_root', f);
    const laneA = idx.nodes.filter(n => n.archetype === archIds[0]).sort((a, b) => a.row - b.row);
    const laneB = idx.nodes.filter(n => n.archetype === archIds[1]).sort((a, b) => a.row - b.row);
    const spine = idx.nodes.filter(n => n.dual && n.col === 1).sort((a, b) => a.row - b.row);
    for (let i = 0; i < 5; i++) {
      T.unlock(laneA[i].id, f); T.unlock(laneB[i].id, f);
      for (const c of spine) if (!c.capstone && T.canUnlock(c.id, f).ok) T.unlock(c.id, f);
    }
    ok(T.canUnlock(spine[3].id, f).ok, charId + ': a two-archetype build reaches the fusion ending');
    T.unlock(spine[3].id, f);
    ok(T.pointsSpent(f) <= T.pointsTotal(f), charId + ': fusion build fits in the points a run banks');
    ok(idx.nodes.filter(n => n.capstone && n.id !== spine[3].id).every(n => !T.canUnlock(n.id, f).ok),
       charId + ': the fusion locks out every other ending');
    const cover = T.pointsSpent(f) / 86;
    ok(cover > 0.2 && cover < 0.5, charId + ': a finished build covers roughly a third of the tree (' + Math.round(cover * 100) + '%)');
  }

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
