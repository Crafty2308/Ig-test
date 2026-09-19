# Ability Tree

A Wynncraft-style ability tree as a drop-in module. No dependencies, no build step.

| file | role |
|---|---|
| `tree.data.js` | the tree itself: 39 nodes, three archetypes, plain data |
| `tree.logic.js` | rules, compilation, persistence. Pure — no DOM, no game code |
| `tree.ui.js` | rendering, tooltips, reset confirmation. Injects its own CSS |
| `tree.test.js` | 219 console assertions. `node tree.test.js`, or load it last in a page |
| `demo.html` | standalone harness: simulate levels, watch the compiled stats update |

The files are classic scripts with a UMD-ish wrapper, so they load straight off
`file://` in a browser *and* `require()` in Node for the assertions. Load order is
data → logic → ui.

## Integration

```html
<script src="abilitytree/tree.data.js"></script>
<script src="abilitytree/tree.logic.js"></script>
<script src="abilitytree/tree.ui.js"></script>
```

```js
// once, at boot
const treeState = AbilityTree.load();          // never throws; unknown ids refund and reset

// when the player levels — the only points hook
AbilityTree.grantPoints(treeState, player.level);
AbilityTree.save(treeState);

// when you want the screen
AbilityTreeUI.mount(document.getElementById('treeMount'), {
  state: treeState,
  onChange: () => applyTree(player)            // fires on unlock and on reset
});

// the game reads the compiled object and nothing else
function applyTree(p) {
  const { stats, flags, dominant, archetypeCounts, pointsLeft } = treeState.compiled;
  p.damageMul  *= stats.damage;                // multipliers arrive pre-multiplied
  p.fireRateMul*= stats.fireRate;
  p.maxHp      += stats.maxHp;                 // flat stats arrive pre-summed
  p.pierce     += stats.pierce;
  if (flags.has('ricochet')) p.bounce += 2;    // flags map onto your own mechanics
}
```

`treeState.compiled` is rebuilt on unlock, reset and load — never per frame. It holds:

```js
{ stats: {...}, flags: Set, archetypeCounts: {onslaught, dominion, kinesis},
  dominant: 'onslaught' | null, pointsTotal, pointsSpent, pointsLeft, level }
```

## Rules

`canUnlock(id, state) -> { ok, reasons[] }` is the single rule function. The UI paints
with it, the tooltip lists its `reasons`, and `unlock()` re-checks with it before
committing — there is no second copy of the logic. A node opens only when:

- the unspent points cover its cost (white 1, yellow 2, red 4 — derived from tier)
- one of its `parents` is unlocked (or it is the root)
- nothing in `blocks[]` is taken, in either direction — pairs lock each other out
- `reqs.archetypeMin` is met — *n* nodes of that archetype already unlocked
- `reqs.pointsSpentMin` is met

Blocks are permanent until `reset(state)`, which refunds everything.

## Tiers

- **white** — small stat nodes, most of the tree, may be neutral (no archetype)
- **yellow** — meaningful modifiers to something already unlocked, always archetype-owned
- **red** — rewrites a weapon behaviour or a core rule. Exactly 3 per archetype

## Archetypes

| | identity |
|---|---|
| **Onslaught** | aggression — damage, crits, executions |
| **Dominion** | control — slows, chains, fields |
| **Kinesis** | mobility — dash, speed, ricochets |

Gating is what forces commitment: the three capstones each need 8 nodes of their own
archetype plus 20 points spent, and each blocks the other two. Spreading evenly across
the tree reaches no capstone at all.

## Schema

```js
{
  id, name, desc,
  tier: 'white' | 'yellow' | 'red',
  archetype: 'onslaught' | 'dominion' | 'kinesis' | null,
  col, row,                       // fixed column grid, rows unbounded
  parents: ['id'],                // connections are derived from these, never authored
  blocks:  ['id'],
  reqs: { archetypeMin: { name, count }, pointsSpentMin: n },
  effect:  { stat, op: 'add'|'mult', value } | { flag: 'name' },
  effects: [ ... ]                // optional list, for a node that does two things
}
```

`effects: [...]` is the one addition to the spec's schema — several nodes trade one stat
against another ("+20% damage, -8% fire rate") and need two effects. `effect: {...}`
singular still works and is used wherever one is enough.

Compilation is additive first, then multiplicative, per stat:
`final = (base + Σ add) × Π mult`.

## Persistence

One key, `neon.abilityTree`:

```json
{ "v": 1, "level": 12, "unlocked": ["core", "ons_1"] }
```

Points are derived from `level`, so a refund is automatic. `load()` never throws:
corrupt JSON, a `null` payload or blocked storage all return a fresh tree, an unknown
node id wipes the build and hands every point back (reported in `state.refunded`, which
the UI surfaces as a note), and a save that no longer satisfies the rules is trimmed
rather than trusted. `MIGRATIONS` maps a save version to the next; a v0 payload (no `v`
field) is upgraded rather than discarded.

## Rendering

Absolutely positioned DOM tiles over a single SVG pipe layer — DOM gives hover, focus,
keyboard and scrolling for free, while one SVG plane lets parent→child elbows be
deduplicated into shared trunks, so multi-parent joins land on one clean pipe with a
junction dot instead of N overlapping strokes.

Node states paint as: `unlocked` (filled, tier-coloured), `reachable` (cyan outline,
lifts on hover), `available` (parent taken but a gate unmet), `blocked` (struck through,
red edge), `locked` (dimmed). Pipes light green between two unlocked nodes and cyan when
the parent is unlocked.

## In Neon Overrun

`shooter.html` replaced its ten per-operative trees with this one shared tree. It grants
points from `gainXp`, opens the UI on Tab or the ★ button, and maps the compiled output
onto the engine in one function, `applyTreeToPlayer()`. A few flags map onto the closest
existing mechanic rather than a new one — `blinkProtocol` becomes a damaging dash rather
than a true teleport, and `perpetualMotion` folds move speed into damage once at run
start instead of per frame.
