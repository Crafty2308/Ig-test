/* ============================================================
   ability tree - DATA
   One tree per operative. Each tree has its own three archetypes,
   its own nodes, and its own capstones.

   node = {
     id, name, desc,
     tier:      'white' | 'yellow' | 'red'   -> drives cost, colour, tooltip framing
     archetype: id of one of that tree's archetypes, or null (neutral, white only)
     col, row:  fixed column grid, rows unbounded
     parents:   [id]   - at least one must be unlocked (root = [])
     blocks:    [id]   - taking this permanently locks those, until reset
     reqs:      { archetypeMin: {name, count}, pointsSpentMin: n }
     effect:    {stat, op:'add'|'mult', value} | {flag:'name'}
     effects:   [ ...same... ]   - optional list when one node does two things
   }

   The w()/y()/r() and lane() helpers below only fill in the mechanical parts
   (ids, grid position, parent chaining, tier gates). Every node's identity,
   text and effects are written out by hand.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbilityTreeData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIER_COST = { white: 1, yellow: 2, red: 4 };
  const TIER_LABEL = { white: 'Minor', yellow: 'Modifier', red: 'Build-defining' };
  const COLS = 9;

  /* effect constructors */
  const add = (stat, value) => ({ stat, op: 'add', value });
  const mult = (stat, value) => ({ stat, op: 'mult', value });
  const flag = name => ({ flag: name });

  /* tier constructors - key, name, desc, then any number of effects */
  const mk = tier => (key, name, desc, ...effects) => ({ key, name, desc, tier, effects });
  const w = mk('white'), y = mk('yellow'), r = mk('red');

  /* Every lane has the same shape, so archetypes stay comparable:
       row1            entry           white
       row2  left + right              white white
       row3            gate            yellow  (needs 2 of this archetype)
       row4  left + right              white white
       row5  left + right              red red - mutually exclusive pair
       row6            join            white   (either red leads here)
       row7            modifier        yellow  (needs 6)
       row8            capstone        red     (needs 8, blocks the other capstones)  */
  function lane(charId, archId, col, defs) {
    if (defs.length !== 11) throw new Error(charId + '/' + archId + ' needs 11 nodes, got ' + defs.length);
    const [entry, l2, r2, gate, l4, r4, redL, redR, join, mod, cap] = defs;
    const id = n => charId + '_' + n.key;
    const L = col - 1, C = col, R = col + 1;

    const node = (n, c, row, parents, extra) => Object.assign({
      id: id(n), name: n.name, desc: n.desc, tier: n.tier, archetype: archId,
      col: c, row: row, parents: parents,
      effects: n.effects.length > 1 ? n.effects : undefined,
      effect: n.effects.length === 1 ? n.effects[0] : undefined
    }, extra || {});

    const arch2 = { archetypeMin: { name: archId, count: 2 } };
    const arch4 = { archetypeMin: { name: archId, count: 4 } };
    const arch6 = { archetypeMin: { name: archId, count: 6 } };
    const arch8 = { archetypeMin: { name: archId, count: 8 }, pointsSpentMin: 12 };

    return [
      node(entry, C, 1, [charId + '_root']),
      node(l2, L, 2, [id(entry)]),
      node(r2, R, 2, [id(entry)]),
      node(gate, C, 3, [id(l2), id(r2)], { reqs: arch2 }),
      node(l4, L, 4, [id(gate)]),
      node(r4, R, 4, [id(gate)]),
      node(redL, L, 5, [id(l4), id(gate)], { reqs: arch4, blocks: [id(redR)] }),
      node(redR, R, 5, [id(r4), id(gate)], { reqs: arch4, blocks: [id(redL)] }),
      node(join, C, 6, [id(redL), id(redR)]),
      node(mod, C, 7, [id(join)], { reqs: arch6 }),
      node(cap, C, 8, [id(mod)], { reqs: arch8, capstone: true })
    ];
  }

  /* assembles a character's tree and wires the capstones to block each other */
  function tree(charId, rootName, rootDesc, rootEffect, archetypes, lanes) {
    const nodes = [{
      id: charId + '_root', name: rootName, desc: rootDesc, tier: 'white',
      archetype: null, col: 4, row: 0, parents: [], effect: rootEffect
    }];
    for (const l of lanes) nodes.push.apply(nodes, l);
    const caps = nodes.filter(n => n.capstone);
    for (const c of caps) c.blocks = caps.filter(o => o !== c).map(o => o.id);
    return { charId, archetypes, nodes };
  }

  const arch = (id, name, color, blurb) => ({ id, name, color, blurb });

  /* base values the compiler starts from.
     'add' effects are summed onto the base, then 'mult' effects multiply. */
  const STAT_BASE = {
    // multipliers
    damage: 1, fireRate: 1, moveSpeed: 1, dashCooldown: 1, statusDuration: 1,
    auraRadius: 1, explosionSize: 1, explosionDamage: 1, droneRate: 1, chainDamage: 1,
    // flat
    maxHp: 0, armor: 0, pierce: 0, projectiles: 0, critChance: 0, critDamage: 0,
    slowPower: 0, chainCount: 0, dashCharges: 0, shield: 0, thorns: 0, lifesteal: 0,
    regen: 0, magnet: 0, burnDamage: 0, burnDuration: 0, orbitCount: 0, orbitDamage: 0,
    droneCount: 0, dashDamage: 0, execute: 0, berserk: 0, scoreBonus: 0, dropBonus: 0,
    bounces: 0, homingStrength: 0, clusterCount: 0, shieldRecharge: 0, frostbiteDamage: 0,
    killChainCount: 0, onKillBlast: 0, droneRepair: 0, killHealAmount: 0, soulHeal: 0
  };

  /* every flag any tree may set. The game maps these onto its own mechanics;
     the test asserts no tree uses a flag that is not listed here. */
  const FLAGS = [
    'shieldBurst', 'fortress', 'secondWind',
    'ignite', 'wildfire', 'immolate', 'emberFeast', 'inferno',
    'chill', 'chillAura', 'stasis', 'shatterChain', 'cryoNova', 'gravityWell',
    'arcShot', 'chainStun', 'staticField', 'arcDash',
    'bladestorm', 'droneBoom', 'droneShield',
    'phaseDash', 'dashStrike', 'dashBlast', 'afterimage', 'blink', 'dashRefund',
    'bounceSplit', 'amplify', 'noFalloff', 'critPierce',
    'steadyAim', 'critBoom', 'volatile', 'carpet', 'megaShell',
    'adrenaline', 'frenzy', 'deathMark',
    'executioner', 'desperate'
  ];

  const TREES = {};

  /* ============================================================
     ROOK - Vanguard. Bulwark Rifle, recharging shield.
     ============================================================ */
  TREES.vanguard = tree('vanguard', 'Frame Uplink', 'Boot the armour. Everything hangs off this.', mult('damage', 1.04),
    [arch('bulwark', 'Bulwark', '#6ec6ff', 'Outlast it. The shield is the build.'),
     arch('retribution', 'Retribution', '#ff5c6e', 'Let them hit you. Make it the last thing they do.'),
     arch('suppression', 'Suppression', '#ffc857', 'Never stop firing. Nothing gets close.')], [
    lane('vanguard', 'bulwark', 1, [
      w('plate', 'Plating', 'Heavier panels.', add('maxHp', 20)),
      w('cell', 'Shield Cell', 'More capacity to burn.', add('shield', 25)),
      w('coolant', 'Coolant Loop', 'The field cycles sooner.', add('shieldRecharge', 1)),
      y('hardlight', 'Hardlight Weave', 'A far deeper field, and thicker armour under it.', add('shield', 40), add('armor', 0.05)),
      w('deflect', 'Deflector', 'Angled panels shed damage.', add('armor', 0.06)),
      w('capacitor', 'Capacitor', 'Bigger reservoir.', add('shield', 30)),
      r('overshield', 'Overshield', 'When the shield breaks it goes off: a 140-damage shockwave clears the room around you.', flag('shieldBurst'), add('shield', 20)),
      r('siege', 'Siege Mode', 'While the shield holds you take a quarter less damage, but the weight roots you.', flag('fortress'), mult('moveSpeed', 0.85)),
      w('reinforce', 'Reinforce', 'More frame to protect.', add('maxHp', 30)),
      y('secondskin', 'Second Skin', 'The field begins recharging almost immediately.', add('shieldRecharge', 1), add('shield', 25)),
      r('immovable', 'IMMOVABLE', 'Nothing shifts you and nothing gets through: heavy armour, a field that never stays down.', add('armor', 0.20), flag('fortress'), add('shieldRecharge', 1))
    ]),
    lane('vanguard', 'retribution', 4, [
      w('spikes', 'Spikes', 'Contact costs them.', add('thorns', 0.08)),
      w('counter', 'Counterweight', 'Swing back harder.', mult('damage', 1.06)),
      w('riposte', 'Riposte', 'Sharper edges.', add('thorns', 0.08)),
      y('barbed', 'Barbed Plate', 'Anything that touches you loses a chunk of itself.', add('thorns', 0.15)),
      w('hardened', 'Hardened', 'Take the hit better.', add('armor', 0.05)),
      w('heavyframe', 'Heavy Frame', 'More to throw around.', add('maxHp', 25)),
      r('painengine', 'Pain Engine', 'Damage climbs as your health falls. Wounded, you are the most dangerous thing here.', add('berserk', 0.04), flag('desperate')),
      r('aegis', 'Aegis Protocol', 'Whatever strikes you is frozen where it stands and bleeds out in the cold.', add('slowPower', 0.35), flag('chillAura')),
      w('vengeance', 'Vengeance', 'Answer everything.', mult('damage', 1.08)),
      y('backlash', 'Backlash', 'Everything you kill detonates on the way out.', add('onKillBlast', 55)),
      r('retaliation', 'RETALIATION ENGINE', 'Every wound you take is repaid as a blast, and your spikes gut anything that dares close.', add('thorns', 0.30), flag('shieldBurst'), add('onKillBlast', 55))
    ]),
    lane('vanguard', 'suppression', 7, [
      w('trigger', 'Hair Trigger', 'Lighter sear.', mult('fireRate', 1.06)),
      w('belt', 'Long Belt', 'Heavier rounds.', mult('damage', 1.06)),
      w('stabilizer', 'Stabilizer', 'Steadier line.', add('critChance', 0.04)),
      y('sustained', 'Sustained Fire', 'The rifle simply does not stop.', mult('fireRate', 1.14)),
      w('apcore', 'AP Core', 'Punches past the first body.', add('pierce', 1)),
      w('optics', 'Focus Optics', 'Find the seams.', add('critChance', 0.06)),
      r('suppress', 'Suppression Field', 'Your fire pins them: everything you hit is dragged down to a crawl.', flag('chill'), add('slowPower', 0.30)),
      r('breach', 'Breach Rounds', 'Rounds tear through the whole line without slowing, at the cost of bite per body.', add('pierce', 4), flag('noFalloff'), mult('damage', 0.80)),
      w('feedramp', 'Feed Ramp', 'Faster cycling.', mult('fireRate', 1.08)),
      y('grinder', 'Grinder', 'Anything already staggered takes far more from you.', mult('damage', 1.18)),
      r('wallonlead', 'WALL OF LEAD', 'Two more rounds per pull and a savage rate of fire. Accuracy is somebody else\'s problem.', add('projectiles', 2), mult('fireRate', 1.25), mult('damage', 0.88))
    ])
  ]);

  /* ============================================================
     CINDER - Pyro. Flame Projector.
     ============================================================ */
  TREES.cinder = tree('cinder', 'Ignition Core', 'Light the pilot flame.', add('burnDamage', 2),
    [arch('wildfire', 'Wildfire', '#ff8a3d', 'Fire that spreads on its own.'),
     arch('immolation', 'Immolation', '#ffc857', 'Be the hazard. Stand in the middle of it.'),
     arch('backdraft', 'Backdraft', '#ff5c6e', 'Move through them and leave the room burning.')], [
    lane('cinder', 'wildfire', 1, [
      w('accel', 'Accelerant', 'Hotter mix.', add('burnDamage', 3)),
      w('fuel', 'Fuel Tanks', 'Longer burn.', add('burnDuration', 0.7)),
      w('pressure', 'Pressure Valve', 'Faster throughput.', mult('fireRate', 1.08)),
      y('catalyst', 'Catalyst', 'Everything you set alight burns hotter and longer.', add('burnDamage', 5), mult('statusDuration', 1.25)),
      w('napalm', 'Napalm', 'It sticks.', add('burnDuration', 0.8)),
      w('richmix', 'Rich Mix', 'More fuel per pull.', add('burnDamage', 4)),
      r('spread', 'Wildfire', 'A burning body is a bomb: whatever dies alight passes the fire to everything nearby.', flag('wildfire')),
      r('inferno', 'Inferno', 'Fire no longer just ticks. Anything burning takes brutally more from every source.', flag('inferno'), add('burnDamage', 4)),
      w('bellows', 'Bellows', 'Feed the flame.', add('burnDamage', 5)),
      y('feast', 'Ember Feast', 'Killing something that burns feeds you.', flag('emberFeast'), add('lifesteal', 0.02)),
      r('firestorm', 'FIRESTORM', 'The arena becomes the weapon: fire spreads, feeds and doubles back on everything still standing.', flag('wildfire'), flag('inferno'), add('burnDamage', 10))
    ]),
    lane('cinder', 'immolation', 4, [
      w('pilot', 'Pilot Light', 'A permanent halo of heat.', flag('immolate')),
      w('radiant', 'Radiant Plating', 'Wider reach.', mult('auraRadius', 1.15)),
      w('heatsink', 'Heat Sink', 'Stand the heat.', add('maxHp', 20)),
      y('corona', 'Corona', 'The halo becomes a furnace you carry.', mult('auraRadius', 1.25), add('burnDamage', 4)),
      w('emitters', 'Emitters', 'Push it further out.', mult('auraRadius', 1.15)),
      w('ceramic', 'Ceramic Weave', 'Shrug off the backwash.', add('armor', 0.08)),
      r('pyreheart', 'Pyre Heart', 'The fire around you feeds on the dying: every kill heals you and stokes the halo.', flag('emberFeast'), add('killHealAmount', 6)),
      r('meltdown', 'Meltdown', 'Contact is fatal for them: the halo detonates whatever it finishes.', add('onKillBlast', 55), flag('immolate')),
      w('convection', 'Convection', 'Hotter still.', add('burnDamage', 6)),
      y('scorched', 'Scorched Earth', 'Your dash drags the fire with you.', flag('afterimage')),
      r('sunwell', 'SUNWELL', 'You stop being a shooter. Standing near you is the kill condition.', mult('auraRadius', 1.6), add('burnDamage', 14), flag('immolate'))
    ]),
    lane('cinder', 'backdraft', 7, [
      w('lightrig', 'Light Rig', 'Move faster.', mult('moveSpeed', 1.06)),
      w('jets', 'Jets', 'Recharge the dash sooner.', mult('dashCooldown', 0.9)),
      w('thermals', 'Thermals', 'Ride the heat.', mult('moveSpeed', 1.05)),
      y('flashover', 'Flashover', 'Dashing tears a burning wake behind you.', flag('afterimage'), add('burnDamage', 3)),
      w('vents', 'Vents', 'Another charge sooner.', mult('dashCooldown', 0.85)),
      w('chassis', 'Light Chassis', 'Less to carry.', mult('moveSpeed', 1.06)),
      r('detonator', 'Detonator', 'Every dash ends in a fireball.', flag('dashBlast'), mult('explosionSize', 1.2)),
      r('phasefire', 'Phase Fire', 'You pass through the fight untouchable, igniting everything you cross.', flag('phaseDash'), flag('dashStrike'), add('dashDamage', 60)),
      w('afterburn', 'Afterburn', 'The wake lingers.', mult('statusDuration', 1.2)),
      y('chainrush', 'Chain Rush', 'Kills hand the dash straight back.', flag('dashRefund'), add('dashCharges', 1)),
      r('cometrun', 'COMET RUN', 'Three charges, a blazing trail, and a detonation at the end of every one.', add('dashCharges', 2), flag('afterimage'), flag('dashBlast'))
    ])
  ]);

  /* ============================================================
     HALCYON - Cryomancer. Cryo Lance.
     ============================================================ */
  TREES.halcyon = tree('halcyon', 'Coolant Core', 'Bring the temperature down.', add('slowPower', 0.08),
    [arch('permafrost', 'Permafrost', '#8ad8ff', 'Deeper, longer, colder.'),
     arch('shatter', 'Shatter', '#bfeaff', 'Frozen things break. Break them.'),
     arch('whiteout', 'Whiteout', '#6ec6ff', 'Own the ground they have to cross.')], [
    lane('halcyon', 'permafrost', 1, [
      w('coating', 'Cryo Coating', 'Colder rounds.', add('slowPower', 0.08)),
      w('lingering', 'Lingering Frost', 'It outstays the hit.', mult('statusDuration', 1.2)),
      w('supercool', 'Supercooled', 'Sharper bite.', add('slowPower', 0.08)),
      y('deepfreeze', 'Deep Freeze', 'What you hit barely moves at all.', add('slowPower', 0.18)),
      w('icecore', 'Ice Core', 'Colder still.', add('slowPower', 0.08)),
      w('rime', 'Rime', 'The chill lasts.', mult('statusDuration', 1.25)),
      r('flashfreeze', 'Flash Freeze', 'Chilled enemies bleed out in the cold, taking steady damage the whole time.', add('frostbiteDamage', 10)),
      r('blacklice', 'Black Ice', 'The cold spreads: anything that dies frozen chills everything around it.', flag('shatterChain'), flag('chillAura')),
      w('glacial', 'Glacial Rounds', 'Heavier cold.', add('slowPower', 0.08)),
      y('hypothermia', 'Hypothermia', 'The longer they stay chilled, the worse it gets.', add('frostbiteDamage', 10), mult('statusDuration', 1.3)),
      r('absolutezero', 'ABSOLUTE ZERO', 'Nothing in your presence moves at its own pace, and the cold never lifts.', add('slowPower', 0.30), mult('statusDuration', 1.5), flag('chillAura'))
    ]),
    lane('halcyon', 'shatter', 4, [
      w('fracture', 'Fracture Lines', 'Find the cracks.', add('critChance', 0.05)),
      w('heavylance', 'Heavy Lance', 'Drive it deeper.', mult('damage', 1.08)),
      w('brittle', 'Brittle', 'Cold makes them fragile.', mult('damage', 1.06)),
      y('shatterpoint', 'Shatterpoint', 'Anything chilled comes apart under your fire.', mult('damage', 1.25)),
      w('splinter', 'Splinter', 'Through the first body.', add('pierce', 1)),
      w('coldsteel', 'Cold Steel', 'Harder impacts.', add('critDamage', 0.3)),
      r('stasislock', 'Stasis Lock', 'A chilled enemy under a fifth of its health does not die. It shatters.', flag('stasis')),
      r('icepick', 'Ice Pick', 'Every critical hit detonates in a spray of frozen shards.', flag('critBoom'), add('critChance', 0.1)),
      w('cleave', 'Cleave', 'More force behind it.', mult('damage', 1.08)),
      y('avalanche', 'Avalanche', 'Shattered bodies take their neighbours with them.', flag('shatterChain'), add('onKillBlast', 55)),
      r('killingfrost', 'KILLING FROST', 'Frozen is dead: the threshold rises and every shatter sets off the next.', add('execute', 0.15), flag('stasis'), flag('shatterChain'))
    ]),
    lane('halcyon', 'whiteout', 7, [
      w('fog', 'Cold Fog', 'A chill hangs around you.', flag('chillAura')),
      w('frontage', 'Frontage', 'Wider field.', mult('auraRadius', 1.2)),
      w('insulate', 'Insulation', 'Hold your ground.', add('maxHp', 25)),
      y('blizzard', 'Blizzard', 'The field around you drags on everything in it.', mult('auraRadius', 1.3), add('slowPower', 0.1)),
      w('drift', 'Snowdrift', 'Further out.', mult('auraRadius', 1.2)),
      w('coldarmor', 'Cold Armour', 'Frost on your own plating.', add('armor', 0.08)),
      r('cryonova', 'Cryo Nova', 'Every dash detonates a freezing nova around you.', flag('cryoNova')),
      r('gravitywell', 'Gravity Well', 'Explosions collapse into wells that hold whatever survives.', flag('gravityWell'), mult('explosionSize', 1.25)),
      w('deepcold', 'Deep Cold', 'The field bites.', add('frostbiteDamage', 10)),
      y('stormfront', 'Stormfront', 'The field moves with you and never thins.', mult('auraRadius', 1.25), mult('statusDuration', 1.2)),
      r('whiteout', 'WHITEOUT', 'The arena is yours. Everything inside it is slowed, freezing and dying on your terms.', mult('auraRadius', 1.7), add('slowPower', 0.2), add('frostbiteDamage', 10))
    ])
  ]);

  /* ============================================================
     ARC - Tesla. Arc Coil.
     ============================================================ */
  TREES.arc = tree('arc', 'Coil Primer', 'Charge the coil.', add('chainCount', 1),
    [arch('conduction', 'Conduction', '#c8b4ff', 'One shot, many bodies.'),
     arch('overload', 'Overload', '#ff8aff', 'Every death is the next discharge.'),
     arch('capacitor', 'Capacitor', '#8ad8ff', 'Hold the charge. Never stop dumping it.')], [
    lane('arc', 'conduction', 1, [
      w('conduct', 'Conduction', 'One more jump.', add('chainCount', 1)),
      w('amp', 'Amplifier', 'Harder arcs.', mult('chainDamage', 1.2)),
      w('coil', 'Tighter Coil', 'Cleaner discharge.', mult('damage', 1.06)),
      y('lattice', 'Lattice', 'The arc keeps finding another body, and hits properly when it does.', add('chainCount', 1), mult('chainDamage', 1.25)),
      w('copper', 'Copper Core', 'Better conductor.', mult('chainDamage', 1.2)),
      w('reach', 'Extended Reach', 'Longer jumps.', add('chainCount', 1)),
      r('stagger', 'Staggering Arc', 'Every chained hit locks the target in place as well as burning it.', flag('chainStun')),
      r('fullcurrent', 'Full Current', 'Chains stop weakening. Each jump lands like the original shot.', mult('chainDamage', 2.2), flag('arcShot')),
      w('bus', 'Bus Bar', 'More capacity.', add('chainCount', 1)),
      y('cascade', 'Cascade', 'The current refuses to stop.', add('chainCount', 2)),
      r('thunderstorm', 'THUNDERSTORM', 'One trigger pull is a storm: the current crosses the room and hits full strength the whole way.', add('chainCount', 3), mult('chainDamage', 1.8), flag('chainStun'))
    ]),
    lane('arc', 'overload', 4, [
      w('discharge', 'Discharge', 'Death releases charge.', add('killChainCount', 2)),
      w('grounding', 'Grounding', 'Steadier frame.', add('maxHp', 20)),
      w('surge', 'Surge', 'More output.', mult('damage', 1.07)),
      y('feedback', 'Feedback Loop', 'Kills dump a far bigger arc into whatever is left.', add('killChainCount', 2), mult('chainDamage', 1.3)),
      w('voltage', 'Voltage', 'Harder hits.', mult('damage', 1.08)),
      w('relay', 'Relay', 'Longer reach on the discharge.', add('chainCount', 1)),
      r('overkill', 'Overload', 'Every kill detonates, not just arcs.', add('onKillBlast', 55), add('killChainCount', 2)),
      r('runaway', 'Runaway Reaction', 'Each kill winds you up: fire rate spikes and stays there while you keep killing.', flag('frenzy'), mult('fireRate', 1.1)),
      w('breaker', 'Breaker', 'Bigger dump.', mult('chainDamage', 1.25)),
      y('chainkill', 'Chain Kill', 'One death lights the whole cluster.', add('killChainCount', 2), add('onKillBlast', 55)),
      r('criticalmass', 'CRITICAL MASS', 'A single kill cascades through the room, each death feeding the next.', add('killChainCount', 2), add('onKillBlast', 55), flag('frenzy'))
    ]),
    lane('arc', 'capacitor', 7, [
      w('static', 'Static Field', 'A live field around you.', flag('staticField')),
      w('cycle', 'Fast Cycle', 'Quicker discharge.', mult('fireRate', 1.08)),
      w('insulation', 'Insulation', 'Hold more.', add('maxHp', 20)),
      y('chargebank', 'Charge Bank', 'The field hums louder and reaches further.', mult('auraRadius', 1.3), flag('staticField')),
      w('throughput', 'Throughput', 'Faster still.', mult('fireRate', 1.08)),
      w('emitter', 'Emitter Array', 'Wider field.', mult('auraRadius', 1.2)),
      r('arcdash', 'Arc Dash', 'Dashing drags a live cable through everything you pass.', flag('arcDash'), flag('dashStrike'), add('dashDamage', 60)),
      r('tesladrone', 'Tesla Drones', 'Two coils break off and hunt on their own.', add('droneCount', 2), add('orbitDamage', 0)),
      w('supercap', 'Supercapacitor', 'Higher ceiling.', mult('fireRate', 1.08)),
      y('resonance', 'Resonance', 'The field crackles across everything near you.', mult('auraRadius', 1.3), mult('chainDamage', 1.2)),
      r('powerplant', 'POWER PLANT', 'You are the generator: a huge live field, constant discharge, nothing gets to stand near you.', mult('auraRadius', 1.6), flag('staticField'), mult('fireRate', 1.2))
    ])
  ]);

  /* ============================================================
     VEX - Marksman. Longshot.
     ============================================================ */
  TREES.vex = tree('vex', 'Optic Uplink', 'Range the target.', add('critChance', 0.04),
    [arch('precision', 'Precision', '#ffd77a', 'Every shot a critical.'),
     arch('penetration', 'Penetration', '#ff9a3d', 'One round, the whole line.'),
     arch('execution', 'Execution', '#ff5c6e', 'Finish what is already hurt.')], [
    lane('vex', 'precision', 1, [
      w('focus', 'Focus', 'Steadier hold.', add('critChance', 0.06)),
      w('caliber', 'Heavy Caliber', 'More mass.', mult('damage', 1.08)),
      w('hollow', 'Hollow Points', 'Wider wound.', add('critDamage', 0.25)),
      y('marksman', 'Marksmanship', 'Your critical hits come often and land like artillery.', add('critChance', 0.1), add('critDamage', 0.4)),
      w('glass', 'Glass Optics', 'Find the seam.', add('critChance', 0.06)),
      w('handload', 'Handloads', 'Better powder.', mult('damage', 1.08)),
      r('steady', 'Steady Aim', 'Hold still half a second and the next round is guaranteed to crit.', flag('steadyAim'), add('critChance', 0.05)),
      r('killshot', 'Killshot', 'Critical hits detonate on impact.', flag('critBoom'), mult('explosionSize', 1.2)),
      w('trueline', 'True Line', 'Nothing wasted.', add('critDamage', 0.3)),
      y('coldblood', 'Cold Blood', 'Crits hit harder the longer you hold your nerve.', add('critDamage', 0.5)),
      r('oneshot', 'ONE SHOT, ONE KILL', 'Crits tear through every body in the line and hit for nearly triple.', add('critDamage', 1.2), flag('critPierce'), add('critChance', 0.15))
    ]),
    lane('vex', 'penetration', 4, [
      w('ap', 'AP Core', 'Through the first.', add('pierce', 1)),
      w('sabot', 'Sabot', 'Faster round.', mult('damage', 1.07)),
      w('rifling', 'Deep Rifling', 'Straighter flight.', add('critChance', 0.04)),
      y('throughandthrough', 'Through and Through', 'Rounds carry on through a crowd without losing their edge.', add('pierce', 2), flag('noFalloff')),
      w('tungsten', 'Tungsten', 'Denser core.', mult('damage', 1.1)),
      w('longbarrel', 'Long Barrel', 'More of the charge on target.', mult('damage', 1.08)),
      r('railshot', 'Rail Shot', 'The weapon winds up: far slower, but each round is devastating and unstoppable.', mult('fireRate', 0.6), mult('damage', 2.2), add('pierce', 3)),
      r('splitcore', 'Split Core', 'Rounds break into two on the way out. Twice the line, less per hit.', add('projectiles', 1), mult('damage', 0.82), add('pierce', 1)),
      w('hardpoint', 'Hardpoint', 'Heavier still.', mult('damage', 1.08)),
      y('overpenetrate', 'Overpenetration', 'Nothing is cover any more.', add('pierce', 3)),
      r('lancer', 'LANCER', 'One round, one line, every body on it, full damage to the last.', add('pierce', 6), flag('noFalloff'), mult('damage', 1.3))
    ]),
    lane('vex', 'execution', 7, [
      w('wound', 'Wound Channel', 'They bleed.', mult('damage', 1.06)),
      w('scan', 'Threat Scan', 'Pick the hurt one.', add('critChance', 0.05)),
      w('cull', 'Cull', 'Finish the weak.', add('execute', 0.05)),
      y('executioner', 'Executioner', 'Anything badly wounded simply stops when you look at it.', add('execute', 0.10), flag('executioner')),
      w('deadweight', 'Dead Weight', 'Heavier finisher.', mult('damage', 1.08)),
      w('bounty', 'Bounty Tags', 'Paid per body.', add('scoreBonus', 0.15)),
      r('deathmark', 'Death Mark', 'Every fifth hit brands a target. Marked, it takes half again from everything.', flag('deathMark')),
      r('headhunter', 'Headhunter', 'Kills wind the rifle up and hand back the damage you spent getting there.', flag('frenzy'), add('killHealAmount', 6)),
      w('finisher', 'Finisher', 'Higher threshold.', add('execute', 0.05)),
      y('reaper', 'Reaper\'s Eye', 'The wounded are already dead.', add('execute', 0.08), flag('executioner')),
      r('terminator', 'TERMINATOR', 'A quarter health is a death sentence, and every execution marks the next target.', add('execute', 0.12), flag('deathMark'), add('onKillBlast', 55))
    ])
  ]);

  /* ============================================================
     NYX - Blade Dancer. Twin Pistols.
     ============================================================ */
  TREES.nyx = tree('nyx', 'Servo Prime', 'Spin up the legs.', mult('moveSpeed', 1.04),
    [arch('momentum', 'Momentum', '#9dff5c', 'Speed is the stat. Everything scales off it.'),
     arch('bladestorm', 'Bladestorm', '#cfe6ff', 'Let the blades do the close work.'),
     arch('phase', 'Phase', '#7cffe0', 'Be somewhere else. Arrive hurting.')], [
    lane('nyx', 'momentum', 1, [
      w('light', 'Light Frame', 'Less to carry.', mult('moveSpeed', 1.06)),
      w('tread', 'Grip Tread', 'Better purchase.', mult('moveSpeed', 1.05)),
      w('twitch', 'Twitch Reflex', 'Faster hands.', mult('fireRate', 1.07)),
      y('sprint', 'Sprinter', 'You simply move faster than the fight does.', mult('moveSpeed', 1.14)),
      w('cadence', 'Cadence', 'Faster trigger.', mult('fireRate', 1.08)),
      w('featherweight', 'Featherweight', 'Nothing spare.', mult('moveSpeed', 1.06)),
      r('bloodrush', 'Bloodrush', 'Every kill floods you: speed spikes and the guns run hot.', flag('adrenaline'), flag('frenzy')),
      r('kinetic', 'Kinetic Conversion', 'Your speed becomes damage. The faster you run, the harder you hit.', mult('damage', 1.3), mult('moveSpeed', 1.1)),
      w('overdrive', 'Overdrive', 'Push harder.', mult('moveSpeed', 1.06)),
      y('runandgun', 'Run and Gun', 'Moving no longer costs you output.', mult('fireRate', 1.15)),
      r('perpetual', 'PERPETUAL MOTION', 'Never stop: blistering speed, a permanent rush, and damage that rides all of it.', mult('moveSpeed', 1.25), mult('damage', 1.25), flag('adrenaline'))
    ]),
    lane('nyx', 'bladestorm', 4, [
      w('blade', 'First Blade', 'One blade rides your orbit.', flag('bladestorm'), add('orbitDamage', 12)),
      w('edge', 'Honed Edge', 'Sharper.', add('orbitDamage', 10)),
      w('balance', 'Balance', 'Wider orbit.', add('orbitCount', 1)),
      y('whirl', 'Whirlwind', 'More blades, and they bite properly.', add('orbitCount', 1), add('orbitDamage', 16)),
      w('serrate', 'Serrated', 'Ragged cuts.', add('orbitDamage', 12)),
      w('spin', 'Spin Up', 'Faster orbit.', add('orbitCount', 1)),
      r('shredder', 'Shredder', 'The blades carve anything they finish into a detonation.', add('onKillBlast', 55), add('orbitDamage', 14)),
      r('bloodedge', 'Blood Edge', 'The blades feed you with every cut they take.', add('lifesteal', 0.06), add('orbitDamage', 10)),
      w('vortex', 'Vortex', 'One more blade.', add('orbitCount', 1)),
      y('cyclone', 'Cyclone', 'A wall of steel at arm\'s length.', add('orbitCount', 1), add('orbitDamage', 18)),
      r('bladestorm', 'BLADESTORM', 'Nothing survives contact: a full ring of blades, each one lethal.', add('orbitCount', 2), add('orbitDamage', 30), flag('bladestorm'))
    ]),
    lane('nyx', 'phase', 7, [
      w('coil', 'Phase Coil', 'Recharge sooner.', mult('dashCooldown', 0.88)),
      w('charge', 'Spare Charge', 'One more blink.', add('dashCharges', 1)),
      w('edge2', 'Razor Entry', 'Arrive hurting.', add('dashDamage', 40), flag('dashStrike')),
      y('phasestep', 'Phase Step', 'The blink lasts longer and nothing can touch you inside it.', flag('phaseDash'), mult('dashCooldown', 0.85)),
      w('slipstream', 'Slipstream', 'Quicker recovery.', mult('dashCooldown', 0.85)),
      w('cutting', 'Cutting Entry', 'Harder arrival.', add('dashDamage', 50)),
      r('blink', 'Blink Protocol', 'The dash stops being movement: everything on the line takes the trip badly.', flag('blink'), add('dashDamage', 70)),
      r('afterimage', 'Afterimage', 'You leave something behind that keeps killing.', flag('afterimage'), flag('dashBlast')),
      w('recharge', 'Fast Recharge', 'Charges return sooner.', mult('dashCooldown', 0.85)),
      y('resetter', 'Reset', 'Kills hand the blink straight back.', flag('dashRefund'), add('dashCharges', 1)),
      r('unseen', 'UNSEEN', 'Three charges that refill on every kill, each one a killing blow.', add('dashCharges', 2), flag('dashRefund'), add('dashDamage', 90), flag('phaseDash'))
    ])
  ]);

  /* ============================================================
     COG - Engineer. Nail Driver.
     ============================================================ */
  TREES.cog = tree('cog', 'Workshop Uplink', 'Spin up the fabricator.', add('droneCount', 1),
    [arch('fabrication', 'Fabrication', '#b8c6d8', 'More units in the air.'),
     arch('support', 'Support', '#9dff5c', 'The drones keep you alive.'),
     arch('ordnance', 'Ordnance', '#ff8a3d', 'Arm them properly.')], [
    lane('cog', 'fabrication', 1, [
      w('assembly', 'Assembly Line', 'Another unit.', add('droneCount', 1)),
      w('servos', 'Servos', 'Faster fire.', mult('droneRate', 0.9)),
      w('calibrate', 'Calibration', 'Better aim.', add('critChance', 0.04)),
      y('massproduce', 'Mass Production', 'The bay runs hot: more drones, cycling faster.', add('droneCount', 1), mult('droneRate', 0.85)),
      w('tuning', 'Tuning', 'Harder rounds.', mult('damage', 1.08)),
      w('rapid', 'Rapid Servos', 'Faster still.', mult('droneRate', 0.85)),
      r('swarm', 'Swarm Protocol', 'The bay never stops: a full escort, all of it firing.', add('droneCount', 3), mult('droneRate', 0.85)),
      r('heavyunit', 'Heavy Units', 'Fewer, bigger, and each one hits like your own weapon.', add('droneCount', 1), mult('damage', 1.35), flag('droneBoom')),
      w('overclock', 'Overclock', 'Push the servos.', mult('droneRate', 0.88)),
      y('production', 'Production Line', 'One more off the rack.', add('droneCount', 1)),
      r('hivemind', 'HIVE MIND', 'A full wing of drones, cycling twice as fast as anything should.', add('droneCount', 2), mult('droneRate', 0.6))
    ]),
    lane('cog', 'support', 4, [
      w('repair', 'Repair Bots', 'They patch you up.', add('droneRepair', 1.2)),
      w('plating', 'Spare Plating', 'More frame.', add('maxHp', 25)),
      w('field', 'Field Kit', 'Steady recovery.', add('regen', 0.8)),
      y('medbay', 'Mobile Med Bay', 'The escort keeps you standing through anything.', add('droneRepair', 1.2), add('regen', 1.2)),
      w('barrier', 'Barrier Node', 'A little shielding.', add('shield', 30)),
      w('scrap', 'Scrapper', 'More salvage from the dead.', add('dropBonus', 0.6)),
      r('shieldgen', 'Shield Generator', 'Each drone projects a slice of shielding onto you.', flag('droneShield'), add('shield', 40)),
      r('sacrifice', 'Sacrificial Protocol', 'A drone will take a killing blow for you, once per wave.', flag('secondWind'), add('droneRepair', 1.2)),
      w('redundancy', 'Redundancy', 'Tougher frame.', add('maxHp', 30)),
      y('logistics', 'Logistics', 'The salvage keeps coming.', add('dropBonus', 0.8), add('magnet', 60)),
      r('failsafe', 'FAILSAFE', 'The escort will not let you die: heavy shielding, constant repair, a life held in reserve.', add('shield', 70), add('droneRepair', 1.2), flag('secondWind'))
    ]),
    lane('cog', 'ordnance', 7, [
      w('payload', 'Payload', 'Heavier rounds.', mult('damage', 1.07)),
      w('warhead', 'Warheads', 'Drones carry explosives.', flag('droneBoom')),
      w('propellant', 'Propellant', 'Bigger blasts.', mult('explosionSize', 1.15)),
      y('demolition', 'Demolition Package', 'Every drone round is a grenade.', flag('droneBoom'), mult('explosionDamage', 1.25)),
      w('shrapnel', 'Shrapnel', 'Wider spray.', mult('explosionSize', 1.15)),
      w('charges', 'Shaped Charges', 'Focused force.', mult('explosionDamage', 1.2)),
      r('cluster', 'Cluster Munitions', 'Every blast scatters bomblets.', add('clusterCount', 3)),
      r('minefield', 'Minefield', 'Whatever the drones kill goes up with them.', add('onKillBlast', 55), mult('explosionSize', 1.3)),
      w('highyield', 'High Yield', 'More force.', mult('explosionDamage', 1.2)),
      y('saturation', 'Saturation', 'The bomblets carry bomblets.', add('clusterCount', 3), flag('carpet')),
      r('bombardment', 'BOMBARDMENT', 'The whole escort drops ordnance without pause. Nothing holds ground.', flag('droneBoom'), add('clusterCount', 3), mult('explosionSize', 1.4))
    ])
  ]);

  /* ============================================================
     BOOM - Demolitionist. Grenade Launcher.
     ============================================================ */
  TREES.boom = tree('boom', 'Ordnance Uplink', 'Check the fuses.', mult('explosionSize', 1.05),
    [arch('payload', 'Payload', '#ff6b4a', 'Make each one bigger.'),
     arch('submunitions', 'Submunitions', '#ffc857', 'One shell, many holes.'),
     arch('shockwave', 'Shockwave', '#8ad8ff', 'The blast is the crowd control.')], [
    lane('boom', 'payload', 1, [
      w('charge', 'Bigger Charge', 'More filler.', mult('explosionDamage', 1.15)),
      w('casing', 'Thin Casing', 'Wider spread.', mult('explosionSize', 1.12)),
      w('fuse', 'Fast Fuse', 'Quicker cycling.', mult('fireRate', 1.08)),
      y('highexplosive', 'High Explosive', 'Every shell lands harder and reaches further.', mult('explosionDamage', 1.3), mult('explosionSize', 1.15)),
      w('tamper', 'Tamper Plate', 'Focus the force.', mult('explosionDamage', 1.18)),
      w('propellant', 'Propellant', 'Longer reach.', mult('explosionSize', 1.15)),
      r('fatman', 'Fat Man', 'Every sixth shell is enormous: triple damage, more than double the radius.', flag('megaShell'), mult('explosionSize', 1.15)),
      r('volatile', 'Volatile Rounds', 'Everything you fire detonates, not just the shells.', flag('volatile'), mult('explosionDamage', 1.15)),
      w('yield', 'High Yield', 'More force.', mult('explosionDamage', 1.2)),
      y('overcharge', 'Overcharge', 'The shells barely fit the tube.', mult('explosionDamage', 1.3), mult('explosionSize', 1.1)),
      r('daisycutter', 'DAISY CUTTER', 'One shell clears a quarter of the arena. Mind the splash.', mult('explosionSize', 1.8), mult('explosionDamage', 1.5), flag('megaShell'))
    ]),
    lane('boom', 'submunitions', 4, [
      w('bomblet', 'Bomblets', 'The shell splits.', add('clusterCount', 3)),
      w('scatter', 'Scatter Pack', 'Wider spread.', mult('explosionSize', 1.12)),
      w('timer', 'Short Timers', 'They land sooner.', mult('fireRate', 1.07)),
      y('clusterpack', 'Cluster Pack', 'Each shell throws a handful of smaller ones.', add('clusterCount', 3), mult('explosionDamage', 1.2)),
      w('spread', 'Wide Pattern', 'Cover more ground.', mult('explosionSize', 1.15)),
      w('filler', 'Dense Filler', 'Each bomblet bites.', mult('explosionDamage', 1.18)),
      r('carpet', 'Carpet Bombing', 'The bomblets carry bomblets. The ground stops existing.', flag('carpet'), add('clusterCount', 3)),
      r('sticky', 'Sticky Charges', 'Anything killed by a blast becomes one.', add('onKillBlast', 55), mult('explosionSize', 1.2)),
      w('multi', 'Multi-Pack', 'More per shell.', mult('explosionDamage', 1.15)),
      y('saturation', 'Saturation', 'Nothing walks out of the pattern.', add('clusterCount', 3), mult('explosionSize', 1.2)),
      r('steelrain', 'STEEL RAIN', 'One trigger pull becomes a sustained bombardment that keeps splitting.', add('clusterCount', 3), flag('carpet'), mult('explosionDamage', 1.4))
    ]),
    lane('boom', 'shockwave', 7, [
      w('concussion', 'Concussion', 'The blast staggers.', add('slowPower', 0.2)),
      w('bracing', 'Bracing', 'Ride your own blasts.', add('armor', 0.06)),
      w('overpressure', 'Overpressure', 'Longer stagger.', mult('statusDuration', 1.25)),
      y('shockplate', 'Shock Plate', 'Survivors of a blast are dragged to a crawl.', flag('gravityWell'), add('slowPower', 0.15)),
      w('blastshield', 'Blast Shield', 'Armour against the backwash.', add('armor', 0.08)),
      w('kinetics', 'Kinetics', 'Heavier push.', mult('explosionSize', 1.15)),
      r('demodash', 'Demo Dash', 'Every dash ends in a detonation.', flag('dashBlast'), add('dashDamage', 50)),
      r('wellmaker', 'Well Maker', 'Blasts collapse into wells that hold everything caught in them.', flag('gravityWell'), flag('stasis')),
      w('resonance', 'Resonance', 'Deeper shock.', add('slowPower', 0.15)),
      y('groundzero', 'Ground Zero', 'Nothing near a blast moves properly again.', add('slowPower', 0.2), mult('statusDuration', 1.3)),
      r('seismic', 'SEISMIC', 'Every explosion locks the arena down: crushed, held, and finished where they stand.', flag('gravityWell'), flag('stasis'), mult('explosionSize', 1.4))
    ])
  ]);

  /* ============================================================
     MOURN - Reaper. Soul Scythe.
     ============================================================ */
  TREES.mourn = tree('mourn', 'Reaper\'s Pact', 'Sign it.', add('lifesteal', 0.02),
    [arch('hunger', 'Hunger', '#d08bff', 'Their lives are your health bar.'),
     arch('wrath', 'Wrath', '#ff5c6e', 'The closer to death, the harder you hit.'),
     arch('harvest', 'Harvest', '#8affb0', 'Every kill pays out.')], [
    lane('mourn', 'hunger', 1, [
      w('bite', 'First Bite', 'Take a little back.', add('lifesteal', 0.03)),
      w('thirst', 'Thirst', 'Drink deeper.', add('lifesteal', 0.03)),
      w('edge', 'Keen Edge', 'Harder cuts.', mult('damage', 1.07)),
      y('feed', 'Feeding Frenzy', 'The scythe drinks properly now.', add('lifesteal', 0.05), mult('damage', 1.1)),
      w('gorge', 'Gorge', 'More per wound.', add('lifesteal', 0.03)),
      w('vitality', 'Vitality', 'A bigger vessel.', add('maxHp', 25)),
      r('exsanguinate', 'Exsanguinate', 'Every kill tears a chunk of life straight back into you.', add('killHealAmount', 6), add('lifesteal', 0.03)),
      r('leech', 'Leech Field', 'The dying feed you from across the room.', add('soulHeal', 6), add('magnet', 90)),
      w('sate', 'Sated', 'Hold more.', add('maxHp', 25)),
      y('glut', 'Glutton', 'The wounds never close.', add('lifesteal', 0.06)),
      r('undying', 'UNDYING', 'You heal faster than they can hurt you, and death itself gets one refusal.', add('lifesteal', 0.08), add('killHealAmount', 6), flag('secondWind'))
    ]),
    lane('mourn', 'wrath', 4, [
      w('spite', 'Spite', 'Pain sharpens.', add('berserk', 0.03)),
      w('fury', 'Fury', 'Swing harder.', mult('damage', 1.07)),
      w('scar', 'Scar Tissue', 'Stay standing.', add('armor', 0.06)),
      y('bloodrage', 'Blood Rage', 'Every wound you carry makes you worse to face.', add('berserk', 0.05)),
      w('reckless', 'Reckless', 'Hit harder.', mult('damage', 1.1)),
      w('adrenal', 'Adrenal Spike', 'Move when hurt.', flag('desperate')),
      r('deathwish', 'Death Wish', 'Strip the armour entirely. What you lose in safety you gain in ruin.', mult('damage', 1.45), add('maxHp', -25)),
      r('lastrites', 'Last Rites', 'At the edge of death you cannot be finished, once per wave.', flag('secondWind'), flag('desperate')),
      w('malice', 'Malice', 'Deeper cuts.', mult('damage', 1.1)),
      y('deathmark', 'Death Mark', 'Every fifth strike brands a target for slaughter.', flag('deathMark')),
      r('wrathincarnate', 'WRATH INCARNATE', 'Wounded, you are unstoppable: enormous damage scaling and speed to chase it down.', add('berserk', 0.08), flag('desperate'), mult('damage', 1.2))
    ]),
    lane('mourn', 'harvest', 7, [
      w('gleaner', 'Gleaner', 'Souls drift free.', add('soulHeal', 6)),
      w('pull', 'Soul Pull', 'They come to you.', add('magnet', 70)),
      w('toll', 'Toll', 'Paid per body.', add('scoreBonus', 0.15)),
      y('reaping', 'Reaping', 'Every death leaves something worth taking.', add('soulHeal', 6), add('dropBonus', 0.6)),
      w('tithe', 'Tithe', 'A larger cut.', add('scoreBonus', 0.15)),
      w('wake', 'Wake', 'Recover between cuts.', add('regen', 1.0)),
      r('soulreaper', 'Soul Reaper', 'Each kill heals you and winds the scythe up for the next.', add('killHealAmount', 6), flag('frenzy')),
      r('massgrave', 'Mass Grave', 'The dead take the living with them.', add('onKillBlast', 55), add('killChainCount', 2)),
      w('harvester', 'Harvester', 'More from each.', add('dropBonus', 0.5)),
      y('deathspiral', 'Death Spiral', 'One kill makes the next easier, and the next.', flag('frenzy'), flag('adrenaline')),
      r('endless', 'ENDLESS HARVEST', 'Killing sustains you completely: every death heals, hastens and spreads to the next.', add('killHealAmount', 6), flag('frenzy'), add('onKillBlast', 55))
    ])
  ]);

  /* ============================================================
     IRIS - Prism. Prism Beam.
     ============================================================ */
  TREES.iris = tree('iris', 'Prism Array', 'Split the beam.', add('projectiles', 1),
    [arch('refraction', 'Refraction', '#7cffe0', 'The walls are part of your weapon.'),
     arch('seeker', 'Seeker', '#6ec6ff', 'Shots that do not miss.'),
     arch('spectrum', 'Spectrum', '#e08bff', 'More beams, always more beams.')], [
    lane('iris', 'refraction', 1, [
      w('bounce', 'First Bounce', 'Shots come off the geometry.', add('bounces', 1)),
      w('angle', 'Angle Optics', 'Cleaner reflections.', mult('damage', 1.06)),
      w('elastic', 'Elastic Rounds', 'They keep their speed.', add('pierce', 1)),
      y('refract', 'Refraction', 'Shots bounce again and hit harder each time.', add('bounces', 1), flag('amplify')),
      w('polish', 'Polished Core', 'Less loss per bounce.', mult('damage', 1.08)),
      w('carom', 'Carom', 'Another wall.', add('bounces', 1)),
      r('splitbeam', 'Split Beam', 'Every bounce splits the shot in two.', flag('bounceSplit')),
      r('amplifier', 'Amplifier', 'Each bounce winds the round up instead of wearing it down.', flag('amplify'), mult('damage', 1.15)),
      w('mirror', 'Mirror Finish', 'More bounces.', add('bounces', 1)),
      y('resonant', 'Resonant Cavity', 'The room fills with returning fire.', flag('bounceSplit'), flag('amplify')),
      r('kaleidoscope', 'KALEIDOSCOPE', 'The arena becomes a crossfire of your own making.', add('bounces', 1), flag('bounceSplit'), flag('amplify'), add('projectiles', 1))
    ]),
    lane('iris', 'seeker', 4, [
      w('tracker', 'Tracker', 'Shots lean toward targets.', add('homingStrength', 2.6)),
      w('lens', 'Focus Lens', 'Harder light.', mult('damage', 1.08)),
      w('gyro', 'Gyro Stabiliser', 'Tighter turns.', add('homingStrength', 2.6)),
      y('seeking', 'Seeking Optics', 'Your fire curves hard onto whatever is closest.', add('homingStrength', 2.6), mult('damage', 1.12)),
      w('guidance', 'Guidance', 'Better lock.', add('critChance', 0.05)),
      w('sensor', 'Sensor Pod', 'Wider search.', mult('damage', 1.08)),
      r('swarmfire', 'Swarm Fire', 'The beam breaks into a flock that hunts on its own.', add('projectiles', 2), mult('damage', 0.78), add('homingStrength', 2.6)),
      r('lockon', 'Lock On', 'Nothing escapes a marked target, and marked targets fall apart.', flag('deathMark'), add('homingStrength', 2.6)),
      w('tuned', 'Tuned Array', 'Harder light.', mult('damage', 1.1)),
      y('relentless', 'Relentless', 'The shots simply do not give up.', add('homingStrength', 2.6), add('pierce', 2)),
      r('inescapable', 'INESCAPABLE', 'Every round finds a body. There is no cover and no outrunning it.', add('homingStrength', 2.6), add('pierce', 3), mult('damage', 1.25))
    ]),
    lane('iris', 'spectrum', 7, [
      w('split', 'Split', 'One more beam.', add('projectiles', 1)),
      w('coherence', 'Coherence', 'Tighter grouping.', mult('damage', 1.07)),
      w('cycle', 'Fast Cycle', 'Quicker pulses.', mult('fireRate', 1.08)),
      y('spectrum', 'Full Spectrum', 'The array opens up: more beams, faster.', add('projectiles', 1), mult('fireRate', 1.1)),
      w('prismatic', 'Prismatic', 'Cleaner split.', mult('damage', 1.08)),
      w('rapid', 'Rapid Array', 'Faster still.', mult('fireRate', 1.1)),
      r('scatter', 'Scatter Array', 'A wall of light every pull, each beam thinner.', add('projectiles', 3), mult('damage', 0.7)),
      r('lance', 'Focused Lance', 'All the beams into one: slower, but it goes through everything.', add('projectiles', -1), mult('damage', 2.1), add('pierce', 4)),
      w('output', 'Output', 'More power.', mult('damage', 1.1)),
      y('overdrive', 'Overdrive', 'The array runs past its rating.', mult('fireRate', 1.18)),
      r('whitelight', 'WHITE LIGHT', 'Everything at once: a saturating spread at full power.', add('projectiles', 2), mult('fireRate', 1.2), mult('damage', 1.15))
    ])
  ]);

  /* display names, so the tree can title itself without the game telling it */
  const NAMES = {
    vanguard: 'ROOK', cinder: 'CINDER', halcyon: 'HALCYON', arc: 'ARC', vex: 'VEX',
    nyx: 'NYX', cog: 'COG', boom: 'BOOM', mourn: 'MOURN', iris: 'IRIS'
  };
  for (const id in TREES) TREES[id].name = NAMES[id] || id.toUpperCase();

  /* the tree shown when the game has no character context */
  const DEFAULT_CHAR = 'vanguard';

  return { TREES, DEFAULT_CHAR, STAT_BASE, FLAGS, TIER_COST, TIER_LABEL, COLS };
});
