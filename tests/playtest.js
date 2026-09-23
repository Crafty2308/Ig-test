#!/usr/bin/env node
/* ============================================================
   headless playtest
       node tests/playtest.js
   Opens shooter.html in Chromium the way a player would - from the
   filesystem, with no server - and drives the systems that are easy to
   break silently: the contextual specials, the three trigger-free
   weapons added last, the gear rolls, and a full unassisted run.
   Needs Playwright somewhere on the machine; it looks in the usual places.
   ============================================================ */
const path = require('path');
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright',
                 '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
  try { chromium = require(p).chromium; break; } catch (e) {}
}
if (!chromium) {
  console.error('playwright not found - install it, or point NODE_PATH at it');
  process.exit(2);
}
const FILE = 'file://' + path.resolve(__dirname, '..', 'shooter.html');

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(400);

  /* ---------- contextual specials ---------- */
  {
    const r = await page.evaluate(() => {
    const out = {};
    const setup = (id) => {
      SAVE.unlocked = CHARACTERS.map(c => c.id);
      startRun(id); dev.god = true;
      game.spawnQueue = []; game.betweenWaves = 999; enemies.length = 0;
    };
    const run = (n, firing) => { for (let i = 0; i < n; i++) { mouse.down = firing; step(1/60); } };
    // spawn a dummy that is already awake, tough and holds still
    const dummy = (dx) => {
      spawnEnemy('grunt', player.x + dx, player.y);
      const e = enemies[enemies.length - 1];
      e.spawnT = 0; e.hp = e.maxHp = 1e6; e.speed = 0;
      mouse.x = e.x - camera.x; mouse.y = e.y - camera.y;
      return e;
    };

    // ROOK: aegis rises off the trigger, falls the moment you fire
    setup('vanguard');
    run(60, false); out.rookUpIdle = player.aegisOn;
    run(3, true);   out.rookDownFiring = !player.aegisOn;
    run(40, false); out.rookBackUp = player.aegisOn;

    // ARC: a full meter flips itself to Discharge, empty flips back
    setup('arc');
    player.meter = player.meterMax; run(2, false); out.arcAuto = player.mode === 'discharge';
    player.meter = 0; run(2, false); out.arcBack = player.mode === 'charge';

    // BOOM: charges land while held, all of them go off on release
    setup('boom');
    dummy(200);
    run(90, true); out.boomStuck = stickies.length > 0;
    const held = stickies.length;
    run(4, false); out.boomBlew = stickies.length === 0 && held > 0;

    // IRIS: a dash leaves a prism behind
    setup('iris');
    out.irisNone = prisms.length === 0;
    dashQueued = true; run(3, false); out.irisPrism = prisms.length === 1;

    // COG: holding fire marks a target for the swarm
    setup('cog');
    const cogT = dummy(220);
    run(40, true); out.cogFocus = player.droneFocus === cogT;

    // VESSEL: thralls walk to the cursor, dashing through one eats it
    setup('vessel');
    mouse.x = player.x + 200 - camera.x; mouse.y = player.y - camera.y;
    run(120, true);
    out.vesselThralls = minions.length >= 2;
    const before = minions.length, hp0 = player.hp = 40;
    const m = minions[0]; player.x = m.x - 30; player.y = m.y;
    player.dashDirX = 1; player.dashDirY = 0; dashQueued = true;
    run(14, false);
    out.vesselAte = minions.length < before && player.hp > hp0;

    // ECHO: the ghost owes shots and pays them
    setup('echo');
    dummy(300);
    run(20, true); out.echoOwed = player.echoQueue.length > 0 && player.echoGhosts.length === 1;
    run(120, false); out.echoPaid = player.echoQueue.length === 0;

    // VOID: shots plant wells and never damage on contact
    setup('void');
    const e = dummy(220);
    run(40, true);
    out.voidWell = wells.length > 0;
    out.voidNoImpact = e.hp === 1e6;              // nothing until the well collapses
    run(90, false);
    out.voidImploded = e.hp < 1e6;

    // HARROW: the line hooks, drags, and the next pull rips it out
    setup('harrow');
    const t = dummy(300);
    run(20, true); out.harrowHooked = !!(player.tether && player.tether.state === 'hooked');
    const d0 = Math.hypot(t.x - player.x, t.y - player.y);
    run(60, true);
    out.harrowReeled = Math.hypot(t.x - player.x, t.y - player.y) < d0 - 40;
    out.harrowBled = t.hp < 1e6;
    run(6, false); run(4, true);
    out.harrowYanked = player.tether === null;

    // no ability buttons left anywhere
    out.noButtons = !document.getElementById('actBtn') && !document.getElementById('actBtn2')
                    && typeof window.classAbility === 'undefined';
    return out;
    });
    for (const k in r) ok(r[k], 'special: ' + k);
  }

  /* ---------- the trigger-free three ---------- */
  {
    const r = await page.evaluate(() => {
    const out = {};
    const setup = id => { SAVE.unlocked = CHARACTERS.map(c => c.id); startRun(id); dev.god = true;
      game.spawnQueue = []; game.betweenWaves = 999; enemies.length = 0; };
    const run = (n, firing) => { for (let i = 0; i < n; i++) { mouse.down = firing; step(1/60); } };
    const dummy = dx => { spawnEnemy('grunt', player.x + dx, player.y);
      const e = enemies[enemies.length - 1]; e.spawnT = 0; e.hp = e.maxHp = 1e6; e.speed = 0;
      mouse.x = e.x - camera.x; mouse.y = e.y - camera.y; return e; };

    // SEVER: swings only reach close, lunge you forward, and build momentum
    setup('sever');
    const far = dummy(400);
    run(30, true); out.severNoReach = far.hp === 1e6;
    enemies.length = 0;
    const near = dummy(70);
    player.fireCd = 0; player.vx = 0; player.vy = 0;
    const x0 = player.x;
    run(2, true);
    out.severHits = near.hp < 1e6;
    out.severLunges = player.x > x0;
    run(150, true);
    out.severMomentum = player.momentum > 0;
    player.momentum = player.momentumMax; player.fireCd = 0;
    const hp0 = near.hp; run(2, true);
    out.severWhirl = near.hp < hp0 && player.momentum === 0;

    // LOOM: impacts leave anchors, anchors string up, threads cut
    setup('loom');
    const lt = dummy(220);
    run(40, true);
    out.loomAnchors = anchors.length >= 2;
    // park an untouched dummy right on a thread and check it bleeds without being shot
    const mid = { x: (anchors[0].x + anchors[1].x) / 2, y: (anchors[0].y + anchors[1].y) / 2 };
    spawnEnemy('grunt', mid.x, mid.y);
    const web = enemies[enemies.length - 1]; web.spawnT = 0; web.hp = web.maxHp = 1e6; web.speed = 0;
    const w0 = web.hp;
    run(40, false);                      // trigger released: only the threads are working
    out.loomThreadCuts = web.hp < w0;
    out.loomCapped = anchors.length <= player.threadCap;

    // HALT: dashing drops a field, rounds freeze in it, expiry fires them
    setup('halt');
    const ht = dummy(420);
    out.haltNoField = fields.length === 0;
    player.dashDirX = 1; player.dashDirY = 0; dashQueued = true;
    run(4, false);
    out.haltField = fields.length === 1;
    // shoot into it
    run(40, true);
    const frozen = bullets.filter(x => x.frozen).length;
    out.haltFroze = frozen > 0;
    const heldBase = bullets.filter(x => x.frozen).map(x => x.base)[0];
    fields[0].life = 0.001;
    run(3, false);
    const after = bullets.filter(x => !x.frozen && x.base > heldBase).length;
    out.haltReleased = fields.length === 0 && after > 0;
    run(120, false);
    out.haltDamaged = ht.hp < 1e6;
    return out;
    });
    for (const k in r) ok(r[k], 'weapon: ' + k);
  }

  /* ---------- gear, majors and augments ---------- */
  {
    const r = await page.evaluate(() => {
    const out = {};
    SAVE.unlocked = CHARACTERS.map(c => c.id);
    SAVE.cores = 1e9; saveMeta();

    // every operative has its own pool, and every augment is well formed
    const bad = [];
    for (const c of CHARACTERS) {
      const mine = AUGMENTS.filter(a => a.char === c.id);
      if (mine.length < 5) bad.push(c.id + ':' + mine.length);
    }
    out.perChar = bad.join(',') || 'ok';
    out.everyCharHasSix = bad.length === 0;
    out.augCount = AUGMENTS.length;
    const BANNED = /\b(enhances?|improves?|empowers?|strengthens?|boosts?|better|greatly)\b/i;
    out.augText = AUGMENTS.every(a => a.desc && /\d/.test(a.desc) && !BANNED.test(a.desc) && /[.!]$/.test(a.desc.trim()));
    out.augIdsUnique = new Set(AUGMENTS.map(a => a.id)).size === AUGMENTS.length;
    out.every3 = augmentDue(3) && augmentDue(6) && !augmentDue(4);

    // taking EVERY augment an operative can take must not throw or produce NaN
    const broke = [];
    for (const c of CHARACTERS) {
      startRun(c.id); dev.god = true;
      game.spawnQueue = []; game.betweenWaves = 999;
      try {
        for (const a of AUGMENTS) {
          if (a.char && a.char !== c.id) continue;
          if (a.need && !a.need(player)) continue;
          a.apply(player); player.augments.push(a.id);
        }
        for (let i = 0; i < 420; i++) {
          mouse.down = i % 55 < 45;
          keys['w'] = i % 30 < 15; keys['s'] = i % 30 >= 15;
          if (i % 50 === 0) dashQueued = true;
          if (i % 60 === 0) for (let k = 0; k < 4; k++) spawnEnemy('grunt');
          if (i === 120) spawnEnemy('tank');
          step(1 / 60);
        }
        if (!isFinite(player.hp) || !isFinite(player.dmgMul)) broke.push(c.id + ':nan-player');
        if (enemies.some(e => !isFinite(e.hp))) broke.push(c.id + ':nan-enemy');
      } catch (e) { broke.push(c.id + ':' + e.message); }
    }
    out.allAugsRun = broke.length === 0;
    out.broke = broke.join(' | ');

    // gear: mythic exists, every slot x rarity resolves, majors are reachable
    out.rarities = RARITIES.length;
    out.coverage = SLOTS.every(s => RARITIES.every(rr => GEAR_BASES.some(x => x.slot === s.id && x.rarity === rr.id)));
    out.majorsDeclared = GEAR_BASES.every(x => !x.major || !!MAJORS[x.major]);
    out.everyMythicHasMajor = GEAR_BASES.filter(x => x.rarity === 'mythic').every(x => !!x.major);
    out.noLowMajors = GEAR_BASES.filter(x => ['common','uncommon','rare'].includes(x.rarity)).every(x => !x.major);
    const mtext = Object.values(MAJORS).every(m => m.desc && /\d/.test(m.desc) && /[.!]$/.test(m.desc.trim()));
    out.majorText = mtext;

    // drop rarity actually reaches the top end at depth
    const tally = {};
    for (let i = 0; i < 20000; i++) { const rr = rollRarity(18); tally[rr] = (tally[rr] || 0) + 1; }
    out.rarityMix = Object.keys(tally).map(k => k + ' ' + (tally[k] / 200).toFixed(1) + '%').join(', ');
    out.legendaryReachable = (tally.legendary || 0) / 20000 > 0.03;
    out.mythicReachable = (tally.mythic || 0) / 20000 > 0.005;

    // every major applies cleanly on top of a run
    const mbroke = [];
    for (const k in MAJORS) {
      startRun('vanguard'); dev.god = true;
      try {
        MAJORS[k].apply(player);
        for (let i = 0; i < 180; i++) { mouse.down = true; if (i % 40 === 0) dashQueued = true;
          if (i % 45 === 0) spawnEnemy('grunt'); step(1 / 60); }
        if (!isFinite(player.hp)) mbroke.push(k);
      } catch (e) { mbroke.push(k + ':' + e.message); }
    }
    out.majorsRun = mbroke.length === 0;
    out.mbroke = mbroke.join(', ');

    // mass salvage
    GEAR.stash.length = 0; GEAR.equipped = {};
    for (let i = 0; i < 40; i++) GEAR.stash.push(rollDrop(20));
    for (let i = 0; i < 12; i++) identifyItem(GEAR.stash[i], null);
    const keep = GEAR.stash.find(x => x.base);
    GEAR.equipped[keep.slot] = keep.uid;
    const before = GEAR.stash.length, coresBefore = SAVE.cores;
    const sel = {}; for (const rr of RARITIES) sel[rr.id] = true;
    const done = doMassSalvage(sel, 'both');
    out.bulkLeftWorn = GEAR.stash.length === 1 && GEAR.stash[0].uid === keep.uid;
    out.bulkCounted = done.n === before - 1 && SAVE.cores > coresBefore;

    // gear stats are meaningfully bigger than before
    startRun('vanguard');
    const bare = player.maxHp;
    const myth = GEAR_BASES.find(x => x.id === 'worldheart');
    const it = { uid: 99999, slot: 'chest', rarity: 'mythic', base: 'worldheart', rolls: myth.stats.map(() => 1), rerolls: 0, ins: -1 };
    GEAR.stash.push(it); GEAR.equipped.chest = it.uid;
    startRun('vanguard');
    out.gearBig = player.maxHp - bare > 400;
    out.gearHp = player.maxHp - bare;
    out.majorApplied = player.majors.indexOf('saviour') !== -1;
    return out;
    });
    const info = ['perChar', 'augCount', 'broke', 'mbroke', 'rarityMix', 'rarities', 'gearHp'];
    for (const k in r) if (!info.includes(k)) ok(r[k], 'gear: ' + k);
    ok(r.augCount >= 120, 'gear: a deep augment pool (' + r.augCount + ')');
    ok(!r.broke, 'gear: every operative survives its whole augment pool' + (r.broke ? ' -> ' + r.broke : ''));
    ok(!r.mbroke, 'gear: every major identification runs' + (r.mbroke ? ' -> ' + r.mbroke : ''));
    console.log('  rarity mix at wave 18: ' + r.rarityMix);
  }

  /* ---------- a full unassisted run from the menu ---------- */
  await page.reload();                       // back to a cold boot, the way a player arrives
  await page.waitForTimeout(400);
  await page.click('#playBtn'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => game.state === 'select'), 'flow: Start Run opens character select');
  await page.click('#csDeploy'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => game.state === 'play' && game.wave === 1), 'flow: Deploy starts wave 1');
  const run = await page.evaluate(() => {
    for (let i = 0; i < 5400; i++) {
      if (game.state === 'over' || game.state === 'menu') break;
      mouse.down = true;
      let best = null, bd = 1e9;
      for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < bd) { bd = d; best = e; } }
      if (best) { mouse.x = best.x - camera.x; mouse.y = best.y - camera.y; }
      keys['w'] = (i % 120) < 60; keys['s'] = (i % 120) >= 60;
      keys['a'] = (i % 200) < 100; keys['d'] = (i % 200) >= 100;
      if (i % 90 === 0) dashQueued = true;
      step(1 / 60);
      if (game.state === 'levelup') document.querySelector('#luCards .card').click();
      if (game.state === 'draft') document.querySelector('#agCards .card').click();
    }
    return { wave: game.wave, level: player.level, augs: player.augments.length, char: player.charId,
             upg: Object.keys(player.upgrades).length, stash: GEAR.stash.length, hp: player.hp,
             score: game.score, kills: game.kills, state: game.state };
  });
  console.log('  run: ' + JSON.stringify(run));
  /* the bot walks a fixed pattern and never chases an orb, so what is asserted
     here is that the run keeps moving - the xp curve is checked on its own below */
  ok(run.wave >= 2, 'flow: waves keep closing (' + run.wave + ')');
  ok(run.stash >= 1, 'flow: gear dropped and was banked (' + run.stash + ')');
  ok(isFinite(run.hp) && run.hp > 0, 'flow: health stayed a number');
  ok(run.state === 'play' || run.state === 'over', 'flow: no overlay deadlocked the run');

  /* levels arrive all run, independent of how well anything plays */
  const curve = await page.evaluate(() => {
    startRun('vanguard');
    game.state = 'pause';                       // so the level-up cards do not open
    const levels = [];
    for (let wave = 1; wave <= 20; wave++) {
      const before = player.level;
      const per = 4 * (1 + (wave - 1) * 0.14);  // roughly a wave-scaled common enemy
      for (let k = 0; k < 22; k++) gainXp(per);
      levels.push(player.level - before);
      player.pending = 0;
    }
    return { level: player.level, dry: levels.filter(n => n === 0).length,
             worst: levels.slice(6).reduce((a, n) => Math.min(a, n), 99) };
  });
  ok(curve.level >= 20, 'xp: twenty waves is worth twenty levels (' + curve.level + ')');
  ok(curve.dry === 0, 'xp: no wave passes without a level (' + curve.dry + ' dry)');
  ok(curve.worst >= 1, 'xp: late waves still level you (' + curve.worst + ' per wave)');

  /* the augment beat, driven straight rather than waiting for the bot */
  const draft = await page.evaluate(() => {
    startRun('echo');
    game.wave = 6; game.spawnQueue.length = 0; telegraphs.length = 0; enemies.length = 0;
    game.betweenWaves = 0;
    step(1 / 60);
    const opened = game.state === 'draft' && document.getElementById('augment').classList.contains('show');
    const cards = document.querySelectorAll('#agCards .card').length;
    if (opened) document.querySelector('#agCards .card').click();
    return { opened, cards, taken: player.augments.length, back: game.state };
  });
  ok(draft.opened, 'augment: the draft opens on the third wave cleared');
  ok(draft.cards === 3, 'augment: three cards offered (' + draft.cards + ')');
  ok(draft.taken === 1, 'augment: taking one records it');
  ok(draft.back === 'play', 'augment: the fight resumes after the pick');

  /* a wave with one lost enemy still finishes */
  const straggler = await page.evaluate(() => {
    startRun('vanguard'); dev.god = true;
    game.spawnQueue.length = 0; telegraphs.length = 0; enemies.length = 0;
    spawnEnemy('grunt', WORLD.w - 80, WORLD.h - 80);       // as far from you as the map allows
    const e = enemies[0]; e.spawnT = 0; e.speed = 0;        // and unable to walk to you
    for (let i = 0; i < 60 * 20; i++) step(1 / 60);
    return Math.round(Math.hypot(enemies[0] ? enemies[0].x - player.x : 0, enemies[0] ? enemies[0].y - player.y : 0));
  });
  ok(straggler < 520, 'stragglers: a lost enemy is walked back within reach (' + straggler + ')');

  /* ---------- frame budget ---------- */
  const perf = await page.evaluate(() => {
    startRun('loom'); dev.god = true;
    for (let i = 0; i < 45; i++) spawnEnemy('grunt');
    const t = [];
    for (let i = 0; i < 320; i++) {
      mouse.down = true; mouse.x = 640 + Math.cos(i / 9) * 300; mouse.y = 450 + Math.sin(i / 7) * 220;
      if (i % 40 === 0) dashQueued = true;
      const t0 = performance.now(); step(1 / 60); drawWorld(); drawHUD(); t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    return { median: t[160], p90: t[288] };
  });
  ok(perf.p90 < 16.7, 'perf: 90th percentile frame under the budget (' + perf.p90.toFixed(2) + 'ms)');

  ok(errs.length === 0, 'page threw nothing' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await browser.close();

  console.log('playtest: ' + pass + ' passed, ' + fails.length + ' failed');
  for (const f of fails) console.log('  FAIL ' + f);
  process.exit(fails.length ? 1 : 0);
})();
