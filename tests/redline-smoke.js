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
  await p.evaluate(() => { __redline.debug.manual = true; });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] ?? i })) });
  const run = s => p.evaluate(s => __redline.tick(s), s);
  const R = f => p.evaluate(f);

  ok('playing', await R(() => __redline.state) === 'playing');
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
  const saved = await R(() => JSON.parse(localStorage.getItem('redline.layout') || 'null'));
  ok('layout drag saved', saved && saved.dash && saved.dash.x < .7, saved);

  // --- portrait shows rotate screen
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(150);
  ok('rotate screen in portrait', await p.isVisible('#rotate'));
  await p.setViewportSize({ width: 844, height: 390 });

  ok('no page errors', errs.length === 0, errs);
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
