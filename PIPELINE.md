# Damage pipeline audit

Every point of player-owned damage in the game is applied by one function,
`dealDamage(target, base, source, opts)` in `shooter.html`. Every projectile in the
game — including drone shots — is built by one function, `emitProjectiles(spec)`.
Sources pass **base** damage only; nothing applies its own multipliers.

## Sources

| source | what it is |
|---|---|
| `shot` | the player's weapon |
| `drone` | a COG drone's shot |
| `minion` | a VESSEL thrall's melee strike |
| `beam` | one tick of HALCYON's Cryo Beam |
| `blade` | an orbiting blade touching an enemy |
| `dash` | dash strike / blink contact |
| `blast` | any explosion, including cluster bomblets |
| `chain` | an arc jumping from a hit |
| `burn` | a burn damage-over-time tick |
| `frost` | a frostbite tick on a chilled enemy |
| `aura` | immolation and static field ticks |
| `ground` | a tick of CINDER's burning ground |
| `thorns` | contact damage returned to an attacker |
| `echo` | a shot repeated by ECHO's ghost |
| `tether` | HARROW's harpoon: the hook, the bleed, the chain sweep and the yank |
| `thread` | LOOM's net, one tick per thread per frame |
| `onkill` | an on-death detonation |

VOID's wells do not have a source of their own: the implosion is an ordinary
`explode()` call, so it lands as `blast` and receives everything a blast receives.
Crush Depth inside a well lands as `ground`, and SEVER's swing lands as `blade` —
the same source an orbiting blade uses. HALT's stasis field is not a source at all:
it holds your own `shot` projectiles and hands them back with a bigger `base`, so
they carry every modifier they already had plus two more multipliers.

## Where modifiers come from

Three places, and all three write the same player fields, so nothing has a
private path into damage:

1. **Upgrade cards**, one pick per level.
2. **Augments**, one pick every fifth wave cleared, gated to what the operative
   can use.
3. **Gear**, four worn slots resolved once by `applyGear()` at the start of a run.

## What every source receives

Damage multiplier, critical chance and critical damage, Pain Engine / berserk scaling,
the bonus against slowed targets, the bonus against burning targets, the branded-target
bonus, lifesteal, execute thresholds, and the ARC meter gain. **No exceptions** — a burn
tick and a drone shot both roll crits and both feed lifesteal.

On-hit riders (apply burn, apply slow, chain, crit explosion, death mark) also fire from
every source. They are throttled to once per 0.2s per target so a 60 Hz beam tick cannot
machine-gun them; the throttle is one rule applied to all sources, not a per-source
exclusion.

## Pairs that cannot interact, and why

| modifier | sources it skips | reason |
|---|---|---|
| Multishot (`projectiles`) | minion, blade, dash, blast, chain, burn, frost, aura, ground, thorns, tether, thread, onkill | These have no emission step to duplicate. Thrall strikes are melee, blades scale on `orbitCount`, explosions on `clusterCount`, thralls on `minionCount` and burning ground on `fireSize`. **Applies to `beam`** — multishot splits it into extra rays. |
| Pierce | minion, blade, dash, blast, chain, burn, frost, aura, ground, thorns, tether, thread, onkill | No travel path to pass through. **Applies to `beam`** — pierce is how many bodies one ray damages. |
| Wall bounce | beam, and all non-projectile sources | A beam is re-aimed from the player every frame, so a rebound has nothing to persist on between frames. The rest never travel. |
| Homing | beam, and all non-projectile sources | The beam's direction is the player's aim, resolved every frame; there is nothing to steer. |
| Explosive rounds (`volatile`) | beam, and all non-projectile sources | Continuous contact would detonate 60 times a second. Blasts from other sources already exist (`dashBlast`, `onKillBlast`). |
| Chain-on-hit | `chain` | Recursion guard: an arc that arcs is unbounded. |
| Crit explosion | `blast`, `onkill` | Recursion guard: an explosion that spawns explosions is unbounded. Cluster bomblets are the bounded version of this and are depth-capped. |
| On-kill effects | `onkill` | Recursion guard: a detonation that kills cannot re-trigger detonations. |
| Knockback | beam, blast, chain, burn, frost, aura, ground, thorns, tether, thread, onkill | A tick has no direction to push from, and a beam pushing at 60 Hz would shove targets out of its own line. |
| ARC meter gain | any source while in Discharge mode | By design: Discharge spends the meter, Charge fills it. |
| Multishot, pierce, bounce, homing, explosive rounds | `tether`, `thread` | A harpoon line and a LOOM thread are both a segment between two points, not a projectile: there is nothing to duplicate, pass through, rebound or steer. Its damage still runs the full multiplier, crit, rider and lifesteal path. **`echo` takes all of them** — a ghost shot is built by `emitProjectiles` like any other, so if your shots split, bounce or home, so do the ghost's. |
| Barbed Chain vulnerability | nothing | It is applied inside `dealDamage`, so the hooked enemy takes 30% more from every source in this table, including burn ticks and drone shots. |

Everything not listed above interacts. A headless pass asserts the damage
multiplier, crit, lifesteal and the on-hit riders across all live sources, and
that drone shots carry multishot, pierce, bounce, homing and explosive rounds.
