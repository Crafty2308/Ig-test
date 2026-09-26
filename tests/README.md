# Tests

Three suites, all runnable with plain `node` from the repo root.

    node tests/geom.js          # hit-detection geometry, standalone
    node tests/test.js          # the damage engine, items, trees, allocation
    node tests/combat-test.js   # combat invariants, driven in a real browser
    node tests/redline-smoke.js # REDLINE: movement, melee, gun parts, bullet time, enemies, waves, UI

`geom.js` and `test.js` pull the relevant functions straight out of
`theorycraft.html` and run them in isolation — there is no build step and
no duplicated copy of the engine to drift out of sync.

`combat-test.js` needs Playwright and a Chromium install. It asserts the
rules that make the combat real: a projectile aimed away deals nothing, a
swing at air does nothing, an area shape misses whatever stands outside
it, walking out of a telegraph is always safe, and no damage is ever
applied without a collision.

`redline-smoke.js` boots `redline/index.html` in a mobile-landscape Chromium
with touch, drives the real touch layer (multi-touch joystick + look +
buttons) and runs the sim at a fixed 60 Hz through `__redline.tick()` so the
checks don't depend on how fast the headless GPU renders. It asserts the
core rule (damage = speed × multiplier, 0 speed deals 0), each movement
tool, each enemy mechanic, wave flow, upgrades, and settings persistence.
Three.js loads from the CDN; if that host is unreachable, set
`REDLINE_THREE=/path/to/three.module.min.js` (v0.170.0) to serve it locally.
