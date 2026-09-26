// REDLINE smoke test: boots redline/index.html in a mobile-landscape Chromium,
// drives the real touch layer and the sim, and checks movement invariants.
//   node tests/redline-smoke.js
// If the CDN is unreachable, point REDLINE_THREE at a local three.module.min.js
// (same pinned version) and requests to the CDN are served from it.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.join(__dirname, '..', 'redline', 'index.html');
const SHOTS = process.env.REDLINE_SHOTS || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  if (process.env.REDLINE_THREE) {
    const body = fs.readFileSync(process.env.REDLINE_THREE);
    await p.route(/cdn\.jsdelivr\.net\/npm\/three@/, r => r.fulfill({ body, contentType: 'application/javascript' }));
  }
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/manifest|favicon|icon/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__redline, null, { timeout: 15000 });
  const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  await shot('00-title');

  await p.tap('[data-act=play]');
  await p.waitForTimeout(300);
  await p.evaluate(() => { __redline.debug.manual = true; __redline.WAVE.next = 1e9; });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] ?? i })) });
  const run = s => p.evaluate(s => __redline.tick(s), s);
  const R = f => p.evaluate(f);

  ok('playing', await R(() => __redline.state) === 'playing');
  ok('first wave starts without an upgrade pick', await R(() => { const r = __redline; r.WAVE.next = .01; r.tick(.1); const ok = r.WAVE.n === 1 && r.state === 'playing'; r.enemies.length = 0; r.WAVE.active = false; r.WAVE.queue.length = 0; r.WAVE.n = 0; r.WAVE.next = 1e9; return ok; }));
  ok('touch UI visible', await p.isVisible('#touchUI'));
  const standing = await R(() => ({ y: __redline.P.pos.y, g: __redline.P.onGround }));
  await run(.3);
  ok('settles on ground', await R(() => __redline.P.onGround), standing);

  // --- joystick (left thumb) + look (right thumb) at the same time
  const yaw0 = await R(() => __redline.P.yaw);
  await touch('touchStart', [[150, 280, 1], [520, 200, 2]]);
  await touch('touchMove', [[150, 200, 1], [470, 200, 2]]);
  await run(1.2);
  const moving = await R(() => ({ s: Math.hypot(__redline.P.vel.x, __redline.P.vel.z), yaw: __redline.P.yaw }));
  ok('joystick runs to RUN speed', Math.abs(moving.s - 9) < 1.2, moving);
  ok('look drag turns while moving', Math.abs(moving.yaw - yaw0) > .1, moving);
  await shot('01-run');

  // --- third finger: jump button while moving + looking
  const jb = await R(() => { const r = document.querySelector('#touchUI .tb[data-id=jump]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', [[150, 200, 1], [470, 200, 2], [jb[0], jb[1], 3]]);
  await run(.12);
  ok('multi-touch jump leaves ground', !(await R(() => __redline.P.onGround)) && await R(() => __redline.P.vel.y) > 2);
  await touch('touchEnd', []);
  ok('all buttons released', await R(() => document.querySelectorAll('#touchUI .tb.down').length) === 0);
  await run(.8);

  // --- direct sim checks
  const res = await R(async () => {
    const { P, input, T } = __redline;
    const wait = s => __redline.tick(s);
    const out = {};
    const place = (x, z, yaw) => { P.pos.set(x, __redline.terrainH(x, z), z); P.vel.set(0, 0, 0); P.yaw = yaw; P.pitch = 0; P.onGround = true; P.sliding = false; P.wall = null; P.dashActive = 0; P.slamming = false; P.dash = 2; };
    // flat slide keeps + builds speed
    place(-20, 40, -Math.PI / 2); input.my = 1; await wait(1); input.my = 0;
    const s0 = Math.hypot(P.vel.x, P.vel.z);
    input.slideHeld = true; input.slidePressed = true; await wait(.05);
    out.slideStarted = P.sliding;
    P.pos.set(-20, 0, 40); P.yaw = -Math.PI / 2; P.vel.set(12, 0, 0); // flat stretch heading +x
    await wait(1.2);
    out.slideFlat = Math.hypot(P.vel.x, P.vel.z); out.slidingStill = P.sliding;
    input.slideHeld = false; await wait(.05);
    // downhill slide gains speed: place on bowl heading inward
    place(0, -58, 0); P.yaw = Math.PI; // facing +z (toward center)
    P.vel.set(0, 0, 4); input.slideHeld = true; input.slidePressed = true;
    await wait(.9);
    out.downhill = Math.hypot(P.vel.x, P.vel.z); input.slideHeld = false;
    // dash
    place(-20, 40, -Math.PI / 2); await wait(.1);
    const d0 = P.dash; input.dashPressed = true; await wait(.3);
    out.dash = { used: d0 - P.dash, speed: Math.hypot(P.vel.x, P.vel.z) };
    input.dashPressed = true; await wait(.05); input.dashPressed = true; await wait(.05);
    out.dashCharges = P.dash;
    // slam
    place(0, 8, 0); P.pos.y = 8; P.onGround = false; P.airTime = 1; await wait(.02);
    let slam = null; __redline.hooks.onSlam.push((i, h) => slam = i);
    input.slidePressed = true; await wait(.6);
    out.slamming = P.slamming; out.landed = P.onGround; out.slamImpact = slam;
    // no hard cap, decays above threshold
    place(-20, 40, -Math.PI / 2); P.vel.set(40, 0, 0); input.my = 1; await wait(1); input.my = 0;
    out.decayed = Math.hypot(P.vel.x, P.vel.z);
    return out;
  });
  ok('slide starts', res.slideStarted, res);
  ok('slide keeps speed on flat', res.slideFlat > 11.5 && res.slidingStill, res);
  ok('downhill slide gains speed', res.downhill > 8, res);
  ok('dash spends a charge and bursts', res.dash.used === 1 && res.dash.speed > 10, res.dash);
  ok('dash charges run out', res.dashCharges === 0, res);
  ok('slam lands with impact speed', res.landed && !res.slamming && res.slamImpact > 30, res);
  ok('speed decays above threshold but no cap', res.decayed < 40 && res.decayed > 30, res);

  // --- wall-run: fly along the run-wall at (33,0) whose face normal points toward center (-x)
  const wr = await R(async () => {
    const { P, input } = __redline;
    const wait = s => __redline.tick(s);
    P.pos.set(32.4 - .45 - .3, 2.5, 6); P.vel.set(0, 1, -14); P.yaw = 0; P.onGround = false; P.airTime = .5; P.wall = null;
    input.my = 1;
    await wait(.25);
    const on = !!P.wall, y1 = P.pos.y;
    await wait(.3);
    const s1 = Math.hypot(P.vel.x, P.vel.z);
    input.jumpPressed = true; await wait(.05);
    const s2 = Math.hypot(P.vel.x, P.vel.z);
    input.my = 0;
    return { on, y1, s1, s2, off: !P.wall, vx: P.vel.x };
  });
  ok('wall-run engages', wr.on, wr);
  ok('wall-jump gives a speed boost away from wall', wr.off && wr.s2 > wr.s1 + 2 && wr.vx < 0, wr);
  await shot('02-wall');

  // --- weapons: melee button + guns built from parts. damage = speed × multiplier
  const W2 = await R(() => {
    const r = __redline, { P, input, enemies, spawnEnemy, tick, MEL, ARS } = r;
    const out = {};
    const setup = (speed, dist = 2.5) => {
      enemies.length = 0; for (const o of r.orbs) o.life = 0;
      P.pos.set(-20, r.terrainH(-20, 40), 40); P.vel.set(speed, 0, 0); P.yaw = -Math.PI / 2; P.pitch = -.05; P.onGround = true; P.wall = null;
      P.dashActive = 0; P.sliding = false; P.slamming = false; P.grabbed = null; P.hp = P.maxHp;
      Object.assign(MEL, { cd: 0, hold: 0, charging: false, lunge: 0, lungeE: null });
      for (const g of ARS.guns) { g.cd = 0; g.reloadT = 0; g.charge = 0; g.burstLeft = 0; g.ammo = g.st.mag; }
      ARS.swapT = 0; ARS.buf = 0; r.TIME.hitstop = 0; r.TIME.scale = 1;
      input.meleeHeld = input.attackHeld = false;
      const e = spawnEnemy('dummy', -20 + dist, 40, { home: { x: 0, z: 0 } }); e.spawnT = 0; e.hp = e.maxHp = 5000;
      return e;
    };
    const hit = e => e.maxHp - e.hp;
    // melee tap: blade
    let e = setup(0); input.meleePressed = true; input.meleeHeld = true; tick(1 / 60); input.meleeHeld = false; tick(1 / 60);
    out.zero = hit(e);
    e = setup(12); input.meleePressed = true; input.meleeHeld = true; tick(1 / 60); input.meleeHeld = false; tick(1 / 60);
    out.blade = { dmg: hit(e), speedAfter: Math.hypot(P.vel.x, P.vel.z) };
    // melee hold: hammer spends all speed
    e = setup(10, 3); input.my = .15; input.meleePressed = true; input.meleeHeld = true; tick(1 / 60); const afterSlash = hit(e);
    input.my = 1; tick(.6); P.pos.x = -20; e.pos.x = -17.5; tick(1 / 60); input.meleeHeld = false; tick(1 / 60); input.my = 0;
    out.hammer = { dmg: hit(e) - afterSlash, speedAfter: Math.hypot(P.vel.x, P.vel.z) };
    // lunge: target out of reach but in the crosshair
    e = setup(10, 7.5); input.meleePressed = true; input.meleeHeld = true; tick(1 / 60); const lungeSpeed = Math.hypot(P.vel.x, P.vel.z);
    input.meleeHeld = false; tick(.35);
    out.lunge = { lungeSpeed, dmg: hit(e) };
    // sidearm: 0.9x per shot, ammo ticks down
    ARS.idx = 0;
    e = setup(0, 6); input.attackPressed = true; tick(1 / 60); out.gunZero = hit(e);
    e = setup(15, 6); const a0 = ARS.guns[0].ammo; input.attackPressed = true; tick(1 / 60);
    out.gun = { dmg: hit(e), ammoUsed: a0 - ARS.guns[0].ammo };
    // empty mag auto-reloads
    e = setup(0, 6); ARS.guns[0].ammo = 1; input.attackPressed = true; tick(1 / 60);
    out.reload = { started: ARS.guns[0].reloadT > 0 }; tick(1.2); out.reload.full = ARS.guns[0].ammo === ARS.guns[0].st.mag;
    // headshot crits
    e = setup(15, 6); P.pitch = Math.atan2(1.72 - P.eye, 6); r.settings.aimAssist = false; input.attackPressed = true; tick(1 / 60);
    out.crit = hit(e);
    e = setup(15, 6); P.pitch = Math.atan2(.7 - P.eye, 6); input.attackPressed = true; tick(1 / 60);
    out.body = hit(e); r.settings.aimAssist = true;
    // scattergun recoil launches you backwards even at 0 speed (and deals 0)
    ARS.idx = 1; e = setup(0, 6); P.pitch = 0; input.attackPressed = true; tick(1 / 60);
    out.scatter = { dmg: hit(e), vx: P.vel.x };
    // swap
    ARS.idx = 0; input.swapPressed = true; tick(1 / 60); out.swap = ARS.idx; ARS.idx = 0;
    // parts change stats
    const base = ARS.guns[0].st.mult; ARS.owned.longBarrel = (ARS.owned.longBarrel || 0) + 1; r.install(0, 'longBarrel');
    out.long = { mult: ARS.guns[0].st.mult / base, name: ARS.guns[0].st.name };
    // railcaster: hold to charge, release to fire, pierces two in a row
    ARS.owned.rail = 1; r.install(0, 'rail'); ARS.idx = 0;
    e = setup(20, 25); const e2 = spawnEnemy('dummy', -20 + 29, 40, { home: { x: 0, z: 0 } }); e2.spawnT = 0; e2.hp = e2.maxHp = 5000;
    input.attackHeld = true; input.attackPressed = true; tick(.8); const chargeHeld = hit(e); input.attackHeld = false; tick(1 / 60);
    out.rail = { chargeHeld, dmg: hit(e), dmg2: e2.maxHp - e2.hp, speed: Math.hypot(P.vel.x, P.vel.z) };
    // launcher: explosion + rocket jump off your own feet
    ARS.owned.launcher = 1; r.install(0, 'launcher');
    e = setup(15, 7); P.pitch = 0; input.attackPressed = true; tick(.4); out.rocket = hit(e);
    e = setup(0, 30); P.pitch = -1.4; input.attackPressed = true; tick(.12);
    out.rocketJump = P.vel.y;
    r.install(0, 'sidearm'); r.install(0, 'stdBarrel');
    // deflect an orb back into an enemy
    e = setup(18, 14); const L = spawnEnemy('lancer', -20 + 14, 40); L.spawnT = 0; L.hp = L.maxHp = 5000; e.alive = false;
    r.spawnOrb({ x: -18.5, y: P.pos.y + 1.4, z: 40 }, { x: -15, y: 0, z: 0 }, 11);
    input.meleePressed = true; input.meleeHeld = true; tick(1 / 60); input.meleeHeld = false;
    const mine = r.orbs.some(o => o.life > 0 && o.mine);
    tick(.6);
    out.deflect = { mine, lancerDmg: L.maxHp - L.hp, hp: P.hp };
    // time: the world slows with speed
    enemies.length = 0; P.pos.set(-20, r.terrainH(-20, 40), 40); P.vel.set(40, 0, 0); r.tick(.4); out.tsFast = r.TIME.scale;
    P.vel.set(3, 0, 0); r.tick(.8); out.tsSlow = r.TIME.scale;
    enemies.length = 0;
    return out;
  });
  ok('melee at 0 speed deals 0', W2.zero === 0, W2);
  ok('blade: damage = speed x 1.0', Math.abs(W2.blade.dmg - 12) < .6, W2.blade);
  ok('blade keeps speed on hit', W2.blade.speedAfter > 11.5, W2.blade);
  ok('hold melee: hammer hits hard and spends speed', W2.hammer.dmg > 30 && W2.hammer.speedAfter < .5, W2.hammer);
  ok('melee lunges to targets in the crosshair', W2.lunge.lungeSpeed > 14 && W2.lunge.dmg > 10, W2.lunge);
  ok('gun at 0 speed deals 0', W2.gunZero === 0, W2);
  ok('sidearm: damage = speed x 0.9, uses ammo', Math.abs(W2.gun.dmg - 13.5) < .8 && W2.gun.ammoUsed === 1, W2.gun);
  ok('empty mag auto-reloads', W2.reload.started && W2.reload.full, W2.reload);
  ok('headshots crit, body shots do not', W2.crit > 20 && W2.body > 10 && W2.body < 15, W2);
  ok('scattergun recoil launches you back', W2.scatter.dmg === 0 && W2.scatter.vx < -8, W2.scatter);
  ok('swap switches guns', W2.swap === 1, W2);
  ok('long barrel: +20% mult and renames the gun', Math.abs(W2.long.mult - 1.2) < .01 && /Longshot/.test(W2.long.name), W2.long);
  ok('railcaster charges, then pierces', W2.rail.chargeHeld === 0 && W2.rail.dmg > 60 && W2.rail.dmg2 > 60, W2.rail);
  ok('launcher rockets explode', W2.rocket > 20, W2);
  ok('rocket jump off your feet', W2.rocketJump > 5, W2);
  ok('melee deflects orbs back into enemies', W2.deflect.mine && W2.deflect.lancerDmg > 20 && W2.deflect.hp === 100, W2.deflect);
  ok('world slows at high speed', W2.tsFast < .55 && W2.tsSlow > .95, W2);
  await shot('05-weapons');

  // --- step 3: enemies, getting hit, waves
  const E3 = await R(() => {
    const r = __redline, { P, input, enemies, spawnEnemy, tick, MEL } = r;
    const out = {};
    const reset = () => {
      enemies.length = 0; for (const q of r.puddles) q.life = 0;
      P.pos.set(-20, 0, 40); P.pos.y = r.terrainH(-20, 40); P.vel.set(0, 0, 0); P.yaw = -Math.PI / 2; P.pitch = 0;
      P.onGround = true; P.wall = null; P.dashActive = 0; P.sliding = false; P.slamming = false; P.grabbed = null;
      P.hp = P.maxHp; P.invuln = 0; Object.assign(MEL, { cd: 0, hold: 0, charging: false, lunge: 0 }); r.TIME.hitstop = 0;
      input.mx = input.my = 0;
    };
    const mk = (type, dx, dz) => { const e = spawnEnemy(type, P.pos.x + dx, P.pos.z + dz); e.spawnT = 0; return e; };
    // getting hit costs HP and a chunk of speed, then i-frames
    reset(); P.vel.set(20, 0, 0);
    r.hurtPlayer(10, P.pos.x + 1, P.pos.z);
    out.hit = { hp: P.hp, speed: Math.hypot(P.vel.x, P.vel.z), again: r.hurtPlayer(10, P.pos.x + 1, P.pos.z) };
    // chaser runs you down when you stand still
    reset(); mk('chaser', 8, 0); tick(2.5);
    out.chaser = P.hp;
    // grabber pins you to 0 speed until you mash
    reset(); const g = mk('grabber', 1.3, 0); g.grabCd = 0; P.vel.set(10, 0, 0); tick(.2);
    out.grab = { grabbed: P.grabbed === g, speed: Math.hypot(P.vel.x, P.vel.z) };
    input.my = 1; tick(.3); out.grab.stillPinned = Math.hypot(P.vel.x, P.vel.z) < .01; input.my = 0;
    let presses = 0; while (P.grabbed && presses < 20) { input.attackPressed = true; tick(1 / 60); tick(.05); presses++; }
    out.grab.freedAfter = presses; out.grab.free = !P.grabbed;
    // sludge puddle slows you to a crawl
    reset(); input.my = 1; tick(.6); r.dropPuddle(P.pos.x + 3, P.pos.z); r.puddles.forEach(q => { if (q.life > 0) q.r = 6; }); tick(1.2);
    out.puddle = Math.hypot(P.vel.x, P.vel.z); input.my = 0;
    // well pulls you in
    reset(); P.pos.set(-8, 0, 20); P.pos.y = r.terrainH(-8, 20); const w = spawnEnemy('well', 2, 20); w.spawnT = 0; tick(.5);
    out.well = { vx: P.vel.x, moved: P.pos.x + 8 };
    // shielder: frontal hit below threshold is blocked, fast hit breaks it, back hit always lands
    reset(); let sh = mk('shielder', 2.2, 0); sh.yaw = Math.atan2(-(P.pos.x - sh.pos.x), -(P.pos.z - sh.pos.z)); sh.hp = sh.maxHp = 999;
    P.vel.set(10, 0, 0); input.meleePressed = true; tick(1 / 60);
    out.shield = { slowFront: 999 - sh.hp, still: sh.shield };
    MEL.cd = 0; r.TIME.hitstop = 0; P.vel.set(22, 0, 0); P.pos.x = sh.pos.x - 2.2; input.meleePressed = true; tick(1 / 60);
    out.shield.broke = !sh.shield; out.shield.fastDmg = 999 - sh.hp;
    reset(); sh = mk('shielder', 2.2, 0); sh.yaw = Math.atan2(-(P.pos.x - sh.pos.x), -(P.pos.z - sh.pos.z)) + Math.PI; sh.hp = sh.maxHp = 999;
    P.vel.set(8, 0, 0); input.meleePressed = true; tick(1 / 60);
    out.shield.backDmg = 999 - sh.hp;
    // waves: spawn, clear, advance; shrink every 5
    reset(); r.startWave(1); tick(4);
    out.wave1 = { n: r.WAVE.n, spawned: enemies.length };
    for (const e of enemies) e.hp = -1, e.alive = false; r.WAVE.queue.length = 0; tick(.1); tick(2.5);
    out.upgradeScreen = r.state;
    const edge0 = r.WAVE.n; void edge0;
    return out;
  });
  ok('hit: HP and speed drop', E3.hit.hp === 90 && E3.hit.speed < 12, E3.hit);
  ok('hit: brief invulnerability', E3.hit.again === false, E3.hit);
  ok('chaser damages a standing player', E3.chaser < 100, E3);
  ok('grabber latches and zeroes speed', E3.grab.grabbed && E3.grab.speed < .01 && E3.grab.stillPinned, E3.grab);
  ok('mashing fire breaks the grab', E3.grab.free && E3.grab.freedAfter >= 6, E3.grab);
  ok('sludge puddle slows to a crawl', E3.puddle < 5.5, E3);
  ok('well pulls the player in', E3.well.vx > 1 && E3.well.moved > 0, E3.well);
  ok('shield blocks slow frontal hits', E3.shield.slowFront === 0 && E3.shield.still, E3.shield);
  ok('fast frontal hit breaks the shield', E3.shield.broke && E3.shield.fastDmg > 20, E3.shield);
  ok('hits from behind bypass the shield', E3.shield.backDmg > 6, E3.shield);
  ok('wave 1 spawns enemies', E3.wave1.n === 1 && E3.wave1.spawned > 0, E3.wave1);
  ok('clearing a wave offers upgrades', E3.upgradeScreen === 'upgrade', E3);
  ok('three upgrade cards shown', await p.locator('#upCards .card').count() === 3);
  await shot('06b-upgrade');
  const before = await R(() => ({ ...__redline.mods, hp: __redline.P.maxHp }));
  await p.waitForTimeout(500);
  // pick a part card: the armory opens, install it, continue
  const partIdx = await R(() => [...document.querySelectorAll('#upCards .card')].findIndex(c => c.classList.contains('part')));
  ok('rewards include a gun part', partIdx >= 0);
  await p.tap(`#upCards .card >> nth=${Math.max(0, partIdx)}`);
  await p.waitForTimeout(150);
  ok('picking a part opens the armory', await p.isVisible('#armory'));
  await shot('06c-armory');
  const newPart = await R(() => { const b = document.querySelector('#armList .pitem em'); return b && b.closest('[data-p]').dataset.p; });
  await p.tap(`#armList [data-p="${newPart}"]`);
  const installed = await p.evaluate(id => __redline.ARS.guns.some(g => Object.values(g).includes(id)), newPart);
  ok('tapping a part in the armory installs it', installed, newPart);
  await p.tap('#armDone');
  const after = await R(() => ({ n: __redline.WAVE.n, state: __redline.state }));
  ok('continuing from the armory starts the next wave', after.n === 2 && after.state === 'playing', after);
  void before;
  const RF = await R(() => {
    const r = __redline, { P, enemies } = r;
    enemies.length = 0; r.mods.refund = .5;
    P.pos.set(-20, r.terrainH(-20, 40), 40); P.vel.set(20, 0, 0); P.yaw = -Math.PI / 2; P.pitch = -.1; P.invuln = 0; P.onGround = true;
    r.hurtPlayer(5, P.pos.x + 1, P.pos.z);
    const afterHit = Math.hypot(P.vel.x, P.vel.z);
    const e = r.spawnEnemy('chaser', P.pos.x + 2, P.pos.z); e.spawnT = 0; e.hp = 1;
    r.MEL.cd = 0; r.MEL.lunge = 0; r.TIME.hitstop = 0; r.input.meleePressed = true; r.tick(1 / 60);
    r.mods.refund = 0;
    return { afterHit, afterKill: Math.hypot(P.vel.x, P.vel.z), dead: !e.alive };
  });
  ok('kills refund lost momentum (upgrade)', RF.dead && RF.afterKill > RF.afterHit + 3, RF);
  await shot('06-enemies');

  const shrink = await R(() => { const r = __redline; const before = r.edgeTarget(); r.startWave(6); return [before, r.edgeTarget()]; });
  ok('arena edge shrinks every 5 waves', shrink[1] < shrink[0], shrink);

  // a live look at a mixed wave
  await R(() => { const r = __redline; r.enemies.length = 0; r.P.hp = 999; r.P.pos.set(0, 1.1, 14); r.P.yaw = 0; r.P.pitch = -.08; r.startWave(8); r.tick(6); });
  await shot('07-wave8');

  // --- settings persist + layout editor
  await R(() => __redline.pauseGame());
  ok('paused', await R(() => __redline.state) === 'paused');
  await p.tap('#pause [data-act=settings]');
  await p.waitForTimeout(150);
  await shot('03-settings');
  await p.tap('[data-t=aimAssist]');
  ok('toggle saved', await R(() => JSON.parse(localStorage.getItem('redline.settings')).aimAssist === false));
  await p.tap('[data-act=layout]');
  await p.waitForTimeout(150);
  const eb = await R(() => { const r = document.querySelector('#layoutEd .tb[data-id=dash]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', [[eb[0], eb[1], 9]]);
  await touch('touchMove', [[eb[0] - 120, eb[1] - 60, 9]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(100);
  await shot('04-layout');
  const saved = await R(() => JSON.parse(localStorage.getItem('redline.layout2') || 'null'));
  ok('layout drag saved', saved && saved.dash && saved.dash.x < .7, saved);

  // --- game over
  await p.evaluate(() => { document.querySelector('#layoutEd').classList.add('hidden'); __redline.resumeGame(); });
  await R(() => { const r = __redline; r.P.hp = 100; r.P.invuln = 0; r.hurtPlayer(500); });
  await p.waitForTimeout(900);
  ok('game over screen', await p.isVisible('#over') && await R(() => __redline.state) === 'gameover');
  await shot('08-over');
  ok('best wave saved', await R(() => (JSON.parse(localStorage.getItem('redline.best')) || {}).wave >= 1));
  await p.tap('[data-act=retry]');
  await p.waitForTimeout(200);
  ok('retry restarts', await R(() => __redline.state) === 'playing' && await R(() => __redline.P.hp) === 100);

  // --- portrait shows rotate screen
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(150);
  ok('rotate screen in portrait', await p.isVisible('#rotate'));
  await p.setViewportSize({ width: 844, height: 390 });

  ok('audio context unlocked by a touch', await R(() => !!__redline.AU.ctx));
  ok('no page errors', errs.length === 0, errs);
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
