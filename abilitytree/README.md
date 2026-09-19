# Ability Tree

A Wynncraft-style ability tree as a drop-in module — **one tree per character**, each
with its own three archetypes, its own nodes and its own point pool. No dependencies,
no build step.

| file | role |
|---|---|
| `tree.data.js` | the trees: 11 characters x 36 nodes, three archetype columns each, plain data |
| `tree.logic.js` | rules, compilation, persistence. Pure — no DOM, no game code |
| `tree.ui.js` | rendering, tooltips, reset confirmation. Injects its own CSS |
| `tree.test.js` | 6671 console assertions. `node tree.test.js`, or load it last in a page |
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

// whose tree are we looking at / playing
AbilityTree.setCharacter(treeState, 'nyx');

// when the player levels — the only points hook. Points bank per character.
AbilityTree.grantPoints(treeState, player.level, player.charId);
AbilityTree.save(treeState);

// when you want the screen
AbilityTreeUI.mount(document.getElementById('treeMount'), {
  state: treeState,
  onChange: () => applyTree(player)            // fires on unlock and on reset
});

// the game reads the compiled object and nothing else
function applyTree(p) {
  const { stats, flags, dominant, archetypeCounts, pointsLeft } =
    AbilityTree.recomputeStats(treeState, p.charId);   // or treeState.compiled for the active one
  p.damageMul  *= stats.damage;                // multipliers arrive pre-multiplied
  p.fireRateMul*= stats.fireRate;
  p.maxHp      += stats.maxHp;                 // flat stats arrive pre-summed
  p.pierce     += stats.pierce;
  if (flags.has('ricochet')) p.bounce += 2;    // flags map onto your own mechanics
}
```

`treeState.compiled` is rebuilt on unlock, reset and load — never per frame. It holds:

```js
{ charId, stats: {...}, flags: Set, archetypeCounts: {...that character's three...},
  dominant: '<archetype>' | null, pointsTotal, pointsSpent, pointsLeft, level }
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

## Structure

Each tree is one tall column-grid, 14 rows deep, scrolled top to bottom:

- **Three archetype lanes** at grid columns 0, 2 and 4, nine nodes each, coloured by
  archetype throughout.
- **Two convergence columns** at grid columns 1 and 3, four nodes each. A convergence
  hangs off both neighbouring lanes, is gated on *both* archetypes at once, and feeds
  back into the lane below it, so the columns cross rather than run parallel.
- **Five endings**, all mutually exclusive: one capstone per lane (needs all 8 of that
  lane) and one fusion per convergence column (needs 5 of each of two archetypes plus
  the convergence spine above it).

A pure single-archetype build is possible and reaches its own capstone, but it can never
touch a convergence node — that is the deliberate sacrifice. A two-archetype build gets
the fusion ending and leaves the third lane untouched.

Points are scarce on purpose: a full tree costs 86 points and a level-40 run banks 32,
so a finished build covers roughly a third of it.

## Archetypes

Each class has three of its own. Every archetype carries an identity paragraph that
names the abilities involved, the state they create and the tradeoff they impose, plus
Difficulty / Damage / Defense / Range / Speed each rated Low, Medium or High. Both are
shown when the player hovers (or taps) the archetype's column header.

| class | archetypes |
|---|---|
| ROOK | Bulwark · Retribution · Suppression |
| CINDER | Wildfire · Immolation · Backdraft |
| HALCYON | Sustained · Permafrost · Whiteout |
| ARC | Capacitor · Discharge · Conduction |
| VEX | Wind-Up · Penetration · Execution |
| NYX | Velocity · Bladestorm · Phase |
| COG | Fabrication · Command · Ordnance |
| BOOM | Payload · Submunitions · Shockwave |
| MOURN | Hunger · Wrath · Harvest |
| VESSEL | Legion · Bond · Consumption |
| IRIS | Refraction · Seeker · Spectrum |

## Node descriptions

Every node states what it does in numbers, names the ability it changes, and states its
downside in the same sentence. The test suite enforces this: each description must
contain a digit, must not use `enhances / improves / empowers / strengthens / boosts /
better / greatly`, and must be a punctuated sentence.

## Schema

```js
{
  id, name, desc,
  tier: 'white' | 'yellow' | 'red',
  archetype: 'onslaught' | 'dominion' | 'kinesis' | null,
  col, row,                       // fixed column grid, rows unbounded
  parents: ['id'],                // connections are derived from these, never authored
  blocks:  ['id'],
  dual: ['archA', 'archB'],       // a convergence node, coloured with both
  reqs: { archetypeMins: [{ name, count }, ...], pointsSpentMin: n },
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
{ "v": 2, "active": "nyx",
  "chars": { "nyx": { "level": 12, "unlocked": ["nyx_root", "nyx_light"] }, "...": {} } }
```

Points are derived from each character's own `level` (`ceil(level * 0.8)`), so a refund
is automatic. `load()` never throws:
corrupt JSON, a `null` payload or blocked storage all return a fresh tree, an unknown
node id wipes the build and hands every point back (reported in `state.refunded`, which
the UI surfaces as a note), and a save that no longer satisfies the rules is trimmed
rather than trusted. `MIGRATIONS` maps a save version to the next; a v0 payload (no `v` field) and a v1
payload (the earlier single shared tree) are both upgraded rather than discarded — a v1
build cannot exist in the per-character trees, so it is refunded while the level is kept.

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

`shooter.html` gives each of its ten operatives that operative's own tree. It grants
points from `gainXp` against the operative being played, opens the UI on Tab or the ★
button (the menu button opens the selected operative's tree), and maps the compiled
output onto the engine in one function, `applyTreeToPlayer()`, with a `TREE_FLAGS` table
that warns at boot if any flag is unmapped.

The game ships as a single self-contained file, so it does not load these scripts over
the network — `tools/inline-tree.js` copies them into `shooter.html` between marker
comments. This folder stays the source of truth: edit here, then run

    node tools/inline-tree.js

to refresh the copy inside the game. (`demo.html` loads the real files, so it always
exercises the module itself.) A few flags map onto the closest
existing mechanic rather than a new one — `blinkProtocol` becomes a damaging dash rather
than a true teleport, and `perpetualMotion` folds move speed into damage once at run
start instead of per frame.
