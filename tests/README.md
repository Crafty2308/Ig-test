# Tests

Three suites, all runnable with plain `node` from the repo root.

    node tests/geom.js          # hit-detection geometry, standalone
    node tests/test.js          # the damage engine, items, trees, allocation
    node tests/combat-test.js   # combat invariants, driven in a real browser

`geom.js` and `test.js` pull the relevant functions straight out of
`theorycraft.html` and run them in isolation — there is no build step and
no duplicated copy of the engine to drift out of sync.

`combat-test.js` needs Playwright and a Chromium install. It asserts the
rules that make the combat real: a projectile aimed away deals nothing, a
swing at air does nothing, an area shape misses whatever stands outside
it, walking out of a telegraph is always safe, and no damage is ever
applied without a collision.
