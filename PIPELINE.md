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
| `thorns` | contact damage returned to an attacker |
| `onkill` | an on-death detonation |

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
| Multishot (`projectiles`) | minion, blade, dash, blast, chain, burn, frost, aura, thorns, onkill | These have no emission step to duplicate. Thrall strikes are melee, blades scale on `orbitCount`, explosions on `clusterCount`, and thralls on `minionCount`. **Applies to `beam`** — multishot splits it into extra rays. |
| Pierce | minion, blade, dash, blast, chain, burn, frost, aura, thorns, onkill | No travel path to pass through. **Applies to `beam`** — pierce is how many bodies one ray damages. |
| Wall bounce | beam, and all non-projectile sources | A beam is re-aimed from the player every frame, so a rebound has nothing to persist on between frames. The rest never travel. |
| Homing | beam, and all non-projectile sources | The beam's direction is the player's aim, resolved every frame; there is nothing to steer. |
| Explosive rounds (`volatile`) | beam, and all non-projectile sources | Continuous contact would detonate 60 times a second. Blasts from other sources already exist (`dashBlast`, `onKillBlast`). |
| Chain-on-hit | `chain` | Recursion guard: an arc that arcs is unbounded. |
| Crit explosion | `blast`, `onkill` | Recursion guard: an explosion that spawns explosions is unbounded. Cluster bomblets are the bounded version of this and are depth-capped. |
| On-kill effects | `onkill` | Recursion guard: a detonation that kills cannot re-trigger detonations. |
| Knockback | beam, blast, chain, burn, frost, aura, thorns, onkill | A tick has no direction to push from, and a beam pushing at 60 Hz would shove targets out of its own line. |
| ARC meter gain | any source while in Discharge mode | By design: Discharge spends the meter, Charge fills it. |

Everything not listed above interacts. The checks in
`scratchpad/pipeline.mjs` assert the damage multiplier, crit, lifesteal and the on-hit
riders across all twelve live sources, and that drone shots carry multishot, pierce,
bounce, homing and explosive rounds.
