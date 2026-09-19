/* ============================================================
   ability tree - DATA
   One tall tree per class. Three archetypes run as three parallel
   columns that cross and converge; the strongest nodes sit on the
   convergences and need points in two archetypes to reach.

   Node descriptions state numbers, name the ability they change, and
   state their downside. No vague verbs.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbilityTreeData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIER_COST = { white: 1, yellow: 2, red: 5 };
  const TIER_LABEL = { white: 'Minor', yellow: 'Modifier', red: 'Build-defining' };
  const COLS = 5;                       // lanes at 0 / 2 / 4, convergences at 1 and 3

  const add = (stat, value) => ({ stat, op: 'add', value });
  const mult = (stat, value) => ({ stat, op: 'mult', value });
  const flag = name => ({ flag: name });

  const mk = tier => (key, name, desc, ...effects) => ({ key, name, desc, tier, effects });
  const w = mk('white'), y = mk('yellow'), r = mk('red');

  /* archetype: identity text (names the ability, the state and the tradeoff)
     plus the five ratings shown on its column header. */
  const arch = (id, name, color, desc, ratings) => ({ id, name, color, desc, ratings });

  /* ---- the shape every class shares ----
     row  0      root
     row  1,2    lane whites
     row  3      convergence  (yellow, 2 of each neighbouring archetype)
     row  4      lane white
     row  5      lane yellow  (3 of its own)
     row  6      convergence  (red, 4 of each)
     row  7,8    lane white, lane red (5 of its own)
     row  9      convergence  (yellow, 5 of each)
     row 10,11   lane white, lane yellow (7 of its own)
     row 12      lane capstone (red, all 8 of its own)
     row 13      fusion capstone (red, 6 of each of two archetypes)
     Every capstone and fusion blocks every other, so a tree ends in exactly one. */
  const LANE_ROWS = [1, 2, 4, 5, 7, 8, 10, 11, 12];
  const LANE_TIER = ['white', 'white', 'white', 'yellow', 'white', 'red', 'white', 'yellow', 'red'];
  const CONV_ROWS = [3, 6, 9, 13];
  const CONV_TIER = ['yellow', 'red', 'yellow', 'red'];

  function tree(charId, name, rootNode, archetypes, lanes) {
    const A = archetypes[0].id, B = archetypes[1].id, C = archetypes[2].id;
    const id = n => charId + '_' + n.key;
    const nodes = [{
      id: charId + '_root', name: rootNode.name, desc: rootNode.desc, tier: 'white',
      archetype: null, col: 2, row: 0, parents: [],
      effects: rootNode.effects.length > 1 ? rootNode.effects : undefined,
      effect: rootNode.effects.length === 1 ? rootNode.effects[0] : undefined
    }];

    const laneIds = {};
    const build = (archId, col, defs) => {
      if (defs.length !== 9) throw new Error(charId + '/' + archId + ' needs 9 lane nodes, got ' + defs.length);
      laneIds[archId] = defs.map(id);
      defs.forEach((n, i) => {
        const tier = LANE_TIER[i];
        const reqs = i === 3 ? { archetypeMins: [{ name: archId, count: 3 }] }
                   : i === 5 ? { archetypeMins: [{ name: archId, count: 5 }] }
                   : i === 7 ? { archetypeMins: [{ name: archId, count: 7 }] }
                   : i === 8 ? { archetypeMins: [{ name: archId, count: 8 }], pointsSpentMin: 18 }
                   : undefined;
        nodes.push({
          id: id(n), name: n.name, desc: n.desc, tier: tier, archetype: archId,
          col: col, row: LANE_ROWS[i],
          parents: i === 0 ? [charId + '_root'] : [id(defs[i - 1])],
          reqs: reqs, capstone: i === 8 || undefined,
          effects: n.effects.length > 1 ? n.effects : undefined,
          effect: n.effects.length === 1 ? n.effects[0] : undefined
        });
      });
    };
    build(A, 0, lanes[A]);
    build(B, 2, lanes[B]);
    build(C, 4, lanes[C]);

    /* convergences hang off both neighbouring lanes, and feed back into them */
    const conv = (leftArch, rightArch, col, defs) => {
      if (defs.length !== 4) throw new Error(charId + ' convergence needs 4 nodes, got ' + defs.length);
      const counts = [2, 3, 4, 5];
      const feeders = [1, 3, 5, 7];                // which lane row each one hangs off
      defs.forEach((n, i) => {
        // the convergence column is its own chain, cross-linked into both lanes
        const parents = i === 0
          ? [laneIds[leftArch][feeders[i]], laneIds[rightArch][feeders[i]]]
          : i === 3
            ? [id(defs[i - 1])]
            : [id(defs[i - 1]), laneIds[leftArch][feeders[i]], laneIds[rightArch][feeders[i]]];
        nodes.push({
          id: id(n), name: n.name, desc: n.desc, tier: CONV_TIER[i],
          archetype: null, dual: [leftArch, rightArch],
          col: col, row: CONV_ROWS[i],
          parents: parents,
          reqs: {
            archetypeMins: [{ name: leftArch, count: counts[i] }, { name: rightArch, count: counts[i] }],
            pointsSpentMin: i === 3 ? 18 : undefined
          },
          capstone: i === 3 || undefined,
          effects: n.effects.length > 1 ? n.effects : undefined,
          effect: n.effects.length === 1 ? n.effects[0] : undefined
        });
      });
    };
    conv(A, B, 1, lanes[A + '_' + B]);
    conv(B, C, 3, lanes[B + '_' + C]);

    /* a convergence also opens the lane node beside it, so the columns cross */
    for (const n of nodes) {
      if (!n.dual) continue;
      const nextRow = n.row + 1;
      for (const laneArch of n.dual) {
        const idx = LANE_ROWS.indexOf(nextRow);
        if (idx === -1) continue;
        const target = nodes.find(x => x.archetype === laneArch && x.row === nextRow);
        if (target && target.parents.indexOf(n.id) === -1) target.parents.push(n.id);
      }
    }

    /* every ending is exclusive with every other ending */
    const ends = nodes.filter(n => n.capstone);
    for (const c of ends) c.blocks = ends.filter(o => o !== c).map(o => o.id);

    return { charId, name, archetypes, nodes };
  }

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
    killChainCount: 0, onKillBlast: 0, droneRepair: 0, killHealAmount: 0, soulHeal: 0,
    // the four distinct weapon behaviours
    beamPower: 0, beamRamp: 0, beamRange: 0, focusPower: 0, focusTime: 0,
    meterGain: 0, dischargePower: 0, dischargeChain: 0, chargePower: 0, chargeRate: 0,
    // summoning
    minionCount: 0, minionDamage: 0, minionHealth: 0, minionSpeed: 1, minionRate: 1,
    essenceRegen: 0, summonCost: 0, essenceOnKill: 0,
    consumePower: 0, consumeHeal: 0, consumeRefund: 0, rallyPower: 0, rallyTime: 0
  };

  const FLAGS = [
    'shieldBurst', 'fortress', 'secondWind',
    'ignite', 'wildfire', 'immolate', 'emberFeast', 'inferno',
    'chill', 'chillAura', 'stasis', 'shatterChain', 'cryoNova', 'gravityWell',
    'arcShot', 'chainStun', 'staticField', 'arcDash',
    'bladestorm', 'droneBoom', 'droneShield',
    'phaseDash', 'dashStrike', 'dashBlast', 'afterimage', 'blink', 'dashRefund',
    'bounceSplit', 'amplify', 'noFalloff', 'critPierce',
    'steadyAim', 'critBoom', 'volatile', 'carpet', 'megaShell',
    'adrenaline', 'frenzy', 'deathMark', 'executioner', 'desperate',
    'soulLink', 'thrallBurst', 'phylactery'
  ];

  const TREES = {};

  /* ============================================================ ROOK ============================================================ */
  TREES.vanguard = tree('vanguard', 'ROOK',
    w('root', 'Frame Uplink', 'Boots the armour. +4% damage from every source.', mult('damage', 1.04)),
    [
      arch('bulwark', 'Bulwark', '#6ec6ff',
        'Bulwark makes the shield the weapon. Overshield detonates the field for 140 damage the moment it breaks, and Siege Mode cuts incoming damage 25% for as long as it holds. Siege costs 15% move speed, so Bulwark holds ground rather than taking it.',
        { difficulty: 'Low', damage: 'Low', defense: 'High', range: 'Medium', speed: 'Low' }),
      arch('retribution', 'Retribution', '#ff5c6e',
        'Retribution charges attackers for touching you: Spikes returns a share of their own max HP on contact, and Pain Engine adds up to 40% damage as your health drops. It only pays out while you are hurt, so it works against the healing and shielding the rest of the class wants.',
        { difficulty: 'High', damage: 'High', defense: 'Medium', range: 'Low', speed: 'Medium' }),
      arch('suppression', 'Suppression', '#ffc857',
        'Suppression never lets the Bulwark Rifle stop. Sustained Fire and Feed Ramp stack rate of fire, Breach Rounds punch through four more bodies without losing damage, and Wall of Lead adds two projectiles. Every red in the lane buys volume with damage per shot.',
        { difficulty: 'Low', damage: 'Medium', defense: 'Low', range: 'High', speed: 'Medium' })
    ], {
    bulwark: [
      w('plate', 'Plating', '+25 max HP.', add('maxHp', 25)),
      w('cell', 'Shield Cell', '+30 shield capacity.', add('shield', 30)),
      w('coolant', 'Coolant Loop', 'Your shield starts recharging 0.6s sooner and regenerates 5 more per second.', add('shieldRecharge', 1)),
      y('hardlight', 'Hardlight Weave', '+45 shield capacity and 6% damage reduction.', add('shield', 45), add('armor', 0.06)),
      w('deflect', 'Deflector', '7% damage reduction.', add('armor', 0.07)),
      r('overshield', 'Overshield', 'When your shield breaks it detonates for 140 damage in a 150-unit radius. +20 shield capacity.', flag('shieldBurst'), add('shield', 20)),
      w('capacitor', 'Capacitor', '+35 shield capacity.', add('shield', 35)),
      y('secondskin', 'Second Skin', 'Shield recharge starts 0.6s sooner, regenerates 5 more per second, and gains 25 capacity.', add('shieldRecharge', 1), add('shield', 25)),
      r('immovable', 'IMMOVABLE', 'While any shield remains, incoming damage is reduced 25%. Shield recharge starts a further 0.6s sooner with +5 regeneration, and you gain 20% damage reduction at all times.', flag('fortress'), add('shieldRecharge', 1), add('armor', 0.20))
    ],
    retribution: [
      w('spikes', 'Spikes', 'Enemies that touch you take 8% of their own max HP.', add('thorns', 0.08)),
      w('counter', 'Counterweight', '+7% damage.', mult('damage', 1.07)),
      w('riposte', 'Riposte', 'Enemies that touch you take a further 8% of their own max HP.', add('thorns', 0.08)),
      y('barbed', 'Barbed Plate', 'Enemies that touch you take a further 14% of their own max HP.', add('thorns', 0.14)),
      w('hardened', 'Hardened', '6% damage reduction.', add('armor', 0.06)),
      r('painengine', 'Pain Engine', '+4% damage for every 10% of max HP you are missing, up to +40% at 1 HP. Nothing at full health.', add('berserk', 0.04)),
      w('vengeance', 'Vengeance', '+9% damage.', mult('damage', 1.09)),
      y('backlash', 'Backlash', 'Every enemy you kill detonates for 55 damage in an 80-unit radius.', add('onKillBlast', 55)),
      r('retaliation', 'RETALIATION ENGINE', 'Enemies that touch you take a further 30% of their own max HP, your shield detonates for 140 damage when it breaks, and every kill detonates for 55.', add('thorns', 0.30), flag('shieldBurst'), add('onKillBlast', 55))
    ],
    suppression: [
      w('trigger', 'Hair Trigger', '+7% fire rate.', mult('fireRate', 1.07)),
      w('belt', 'Long Belt', '+7% damage.', mult('damage', 1.07)),
      w('stabilizer', 'Stabilizer', '+5% critical hit chance.', add('critChance', 0.05)),
      y('sustained', 'Sustained Fire', '+14% fire rate.', mult('fireRate', 1.14)),
      w('apcore', 'AP Core', 'Bullwark Rifle rounds pass through 1 more enemy.', add('pierce', 1)),
      r('breach', 'Breach Rounds', 'Rounds pass through 4 more enemies and keep full damage through every one. Costs 20% damage per shot.', add('pierce', 4), flag('noFalloff'), mult('damage', 0.80)),
      w('feedramp', 'Feed Ramp', '+9% fire rate.', mult('fireRate', 1.09)),
      y('grinder', 'Grinder', '+18% damage.', mult('damage', 1.18)),
      r('wallonlead', 'WALL OF LEAD', '+2 projectiles per shot and +25% fire rate. Each projectile deals 12% less damage.', add('projectiles', 2), mult('fireRate', 1.25), mult('damage', 0.88))
    ],
    bulwark_retribution: [
      y('reactive', 'Reactive Plating', '+30 shield capacity, and enemies that touch you take 10% of their own max HP.', add('shield', 30), add('thorns', 0.10)),
      r('thornfield', 'Thornfield', 'While any shield remains, incoming damage is reduced 25%. Enemies that touch you take a further 20% of their own max HP.', flag('fortress'), add('thorns', 0.20)),
      y('counterfield', 'Counterfield', '+40 shield capacity and +10% damage.', add('shield', 40), mult('damage', 1.10)),
      r('doctrine', 'FORTRESS DOCTRINE', 'Your shield detonates for 140 damage when it breaks, enemies that touch you take 30% of their own max HP, and damage taken is reduced 25% while any shield remains.', flag('shieldBurst'), add('thorns', 0.30), flag('fortress'))
    ],
    retribution_suppression: [
      y('spite', 'Suppressive Spite', '+10% fire rate, and enemies that touch you take 10% of their own max HP.', mult('fireRate', 1.10), add('thorns', 0.10)),
      r('bleedfire', 'Bleed Fire', 'Rifle rounds set enemies alight for 6 damage per second for 2s, and burning enemies take 45% more damage from every source.', flag('ignite'), flag('inferno')),
      y('volley', 'Punishing Volley', '+12% damage and +8% fire rate.', mult('damage', 1.12), mult('fireRate', 1.08)),
      r('laststand', 'LAST STAND', '+4% damage per 10% missing HP, +20% fire rate, and once per wave a killing blow leaves you at 25 HP with 1.6s of invulnerability instead.', add('berserk', 0.04), mult('fireRate', 1.20), flag('secondWind'))
    ]
  });

  /* ============================================================ CINDER ============================================================ */
  TREES.cinder = tree('cinder', 'CINDER',
    w('root', 'Ignition Core', 'Lights the pilot flame. Flame Projector hits set enemies alight for 2 more damage per second.', add('burnDamage', 2)),
    [
      arch('wildfire', 'Wildfire', '#ff8a3d',
        'Wildfire makes the burn do the killing. Catalyst raises burn damage and duration, Spread passes the fire from any burning corpse to everything within 110 units, and Inferno adds 45% damage from every source against anything alight. It needs targets to live long enough to burn, so it is weak against single tough enemies.',
        { difficulty: 'Medium', damage: 'High', defense: 'Low', range: 'Low', speed: 'Medium' }),
      arch('immolation', 'Immolation', '#ffc857',
        'Immolation makes standing near you lethal. Pilot Light burns everything within 70 units for 12 per second, Corona widens that ring, and Pyre Heart turns each kill inside it into healing. You have to be in melee range for any of it to work.',
        { difficulty: 'High', damage: 'Medium', defense: 'Medium', range: 'Low', speed: 'Low' }),
      arch('backdraft', 'Backdraft', '#ff5c6e',
        'Backdraft turns the dash into the attack. Flashover leaves a burning trail behind every dash, Detonator ends each one in a 90-damage blast, and Chain Rush refunds a charge on every kill so the dashes never stop. Damage comes from moving, not from aiming.',
        { difficulty: 'Medium', damage: 'Medium', defense: 'Medium', range: 'Low', speed: 'High' })
    ], {
    wildfire: [
      w('accel', 'Accelerant', 'Burning enemies take 3 more damage per second.', add('burnDamage', 3)),
      w('fuel', 'Fuel Tanks', 'Burns last 0.7s longer.', add('burnDuration', 0.7)),
      w('pressure', 'Pressure Valve', '+8% fire rate.', mult('fireRate', 1.08)),
      y('catalyst', 'Catalyst', 'Burning enemies take 5 more damage per second, and every status you apply lasts 25% longer.', add('burnDamage', 5), mult('statusDuration', 1.25)),
      w('napalm', 'Napalm', 'Burns last 0.8s longer.', add('burnDuration', 0.8)),
      r('spread', 'Wildfire', 'When a burning enemy dies, everything within 110 units catches fire at your current burn damage.', flag('wildfire')),
      w('bellows', 'Bellows', 'Burning enemies take 5 more damage per second.', add('burnDamage', 5)),
      y('feast', 'Ember Feast', 'Killing a burning enemy heals you for 5, and you heal for 2% of all damage dealt.', flag('emberFeast'), add('lifesteal', 0.02)),
      r('firestorm', 'FIRESTORM', 'Burning enemies take 45% more damage from every source and 10 more damage per second, and any burning corpse sets fire to everything within 110 units.', flag('inferno'), add('burnDamage', 10), flag('wildfire'))
    ],
    immolation: [
      w('pilot', 'Pilot Light', 'Everything within 70 units of you burns for 12 damage per second.', flag('immolate')),
      w('radiant', 'Radiant Plating', 'Your aura radius is 15% larger.', mult('auraRadius', 1.15)),
      w('heatsink', 'Heat Sink', '+25 max HP.', add('maxHp', 25)),
      y('corona', 'Corona', 'Aura radius +25%, and burning enemies take 4 more damage per second.', mult('auraRadius', 1.25), add('burnDamage', 4)),
      w('emitters', 'Emitters', 'Aura radius +15%.', mult('auraRadius', 1.15)),
      r('pyreheart', 'Pyre Heart', 'Killing a burning enemy heals you for 5, and every kill heals you for a further 6.', flag('emberFeast'), add('killHealAmount', 6)),
      w('convection', 'Convection', 'Burning enemies take 6 more damage per second.', add('burnDamage', 6)),
      y('meltdown', 'Meltdown', 'Every kill detonates for 55 damage in an 80-unit radius.', add('onKillBlast', 55)),
      r('sunwell', 'SUNWELL', 'Aura radius +60%, everything in it burns for a further 14 damage per second, and enemies inside are set alight continuously.', mult('auraRadius', 1.60), add('burnDamage', 14), flag('immolate'))
    ],
    backdraft: [
      w('lightrig', 'Light Rig', '+6% move speed.', mult('moveSpeed', 1.06)),
      w('jets', 'Jets', 'Dash recharges 10% faster.', mult('dashCooldown', 0.90)),
      w('thermals', 'Thermals', '+5% move speed.', mult('moveSpeed', 1.05)),
      y('flashover', 'Flashover', 'Dashing leaves a burning trail that sets enemies alight, and burns deal 3 more damage per second.', flag('afterimage'), add('burnDamage', 3)),
      w('vents', 'Vents', 'Dash recharges 15% faster.', mult('dashCooldown', 0.85)),
      r('detonator', 'Detonator', 'Every dash ends in a 90-damage explosion, with 20% larger blasts.', flag('dashBlast'), mult('explosionSize', 1.20)),
      w('chassis', 'Light Chassis', '+6% move speed.', mult('moveSpeed', 1.06)),
      y('chainrush', 'Chain Rush', 'Every kill refunds a dash charge, and you gain 1 more charge.', flag('dashRefund'), add('dashCharges', 1)),
      r('cometrun', 'COMET RUN', '+2 dash charges, dashes leave a burning trail, and each one ends in a 90-damage explosion.', add('dashCharges', 2), flag('afterimage'), flag('dashBlast'))
    ],
    wildfire_immolation: [
      y('emberfield', 'Ember Field', 'Aura radius +20%, and burning enemies take 4 more damage per second.', mult('auraRadius', 1.20), add('burnDamage', 4)),
      r('conflagration', 'Conflagration', 'Everything within 70 units of you burns for 12 per second, and any burning corpse sets fire to everything within 110 units.', flag('immolate'), flag('wildfire')),
      y('hearth', 'Hearth', 'Killing a burning enemy heals 5, and burns last 30% longer.', flag('emberFeast'), mult('statusDuration', 1.30)),
      r('pyreclasm', 'PYRECLASM', 'Burning enemies take 45% more damage from every source, your aura burns everything within 70 units, and burning corpses spread the fire.', flag('inferno'), flag('immolate'), flag('wildfire'))
    ],
    immolation_backdraft: [
      y('scorchrun', 'Scorched Run', 'Dashes leave a burning trail, and aura radius +15%.', flag('afterimage'), mult('auraRadius', 1.15)),
      r('wildfiredash', 'Firewalker', 'Every dash ends in a 90-damage explosion and every kill refunds a dash charge.', flag('dashBlast'), flag('dashRefund')),
      y('emberwake', 'Ember Wake', '+8% move speed, and every kill heals you for 6.', mult('moveSpeed', 1.08), add('killHealAmount', 6)),
      r('inferno_engine', 'INFERNO ENGINE', '+2 dash charges, each dash ends in a 90-damage blast and leaves a burning trail, and enemies within 70 units burn continuously.', add('dashCharges', 2), flag('dashBlast'), flag('afterimage'), flag('immolate'))
    ]
  });

  /* ============================================================ HALCYON ============================================================ */
  TREES.halcyon = tree('halcyon', 'HALCYON',
    w('root', 'Coolant Core', 'Primes the emitter. Cryo Beam deals 6 more damage per second.', add('beamPower', 6)),
    [
      arch('sustained', 'Sustained', '#8ad8ff',
        'Sustained is about contact time. The Cryo Beam ramps to 2.8x damage after 2.6s on one target; Focused Lens raises that ceiling and Long Emitter extends the beam so you can hold it from further away. Switching targets bleeds the ramp, so it punishes panic.',
        { difficulty: 'High', damage: 'High', defense: 'Low', range: 'High', speed: 'Low' }),
      arch('permafrost', 'Permafrost', '#6ec6ff',
        'Permafrost stacks the chill the beam applies until nothing can close on you. Deep Freeze raises slow power, Hypothermia makes chilled enemies bleed 10 per second, and Stasis Lock shatters any chilled enemy below 20% health outright. It adds almost no raw damage on its own.',
        { difficulty: 'Low', damage: 'Medium', defense: 'High', range: 'Medium', speed: 'Medium' }),
      arch('whiteout', 'Whiteout', '#bfeaff',
        'Whiteout fights the room instead of the target. Cold Fog chills everything within 150 units, Cryo Nova freezes a 190-unit circle on every dash, and Gravity Well drags survivors of any explosion. Its damage is all indirect, so it needs the beam or Permafrost to close kills.',
        { difficulty: 'Medium', damage: 'Low', defense: 'High', range: 'Medium', speed: 'Medium' })
    ], {
    sustained: [
      w('focus1', 'Focusing Ring', 'Cryo Beam deals 6 more damage per second.', add('beamPower', 6)),
      w('emitter1', 'Long Emitter', 'Cryo Beam reaches 60 units further.', add('beamRange', 60)),
      w('coil1', 'Cooled Coil', 'Cryo Beam deals 6 more damage per second.', add('beamPower', 6)),
      y('lens', 'Focusing Lens', 'Cryo Beam ramps to 3.4x instead of 2.8x at full contact time, and deals 5 more damage per second.', add('beamRamp', 0.6), add('beamPower', 5)),
      w('aperture', 'Wide Aperture', 'Cryo Beam reaches 60 units further.', add('beamRange', 60)),
      r('overdrive', 'Overdrive', 'Cryo Beam ramps to 4.6x at full contact time. The ramp still resets if you switch targets.', add('beamRamp', 1.8)),
      w('supercool', 'Supercooled', 'Cryo Beam deals 8 more damage per second.', add('beamPower', 8)),
      y('pierce_beam', 'Penetrating Beam', 'Cryo Beam passes through 2 more enemies, damaging each one.', add('pierce', 2)),
      r('zeropoint', 'ZERO POINT', 'Cryo Beam ramps to 5.4x at full contact time and deals 18 more damage per second, and passes through 2 more enemies.', add('beamRamp', 2.6), add('beamPower', 18), add('pierce', 2))
    ],
    permafrost: [
      w('coating', 'Cryo Coating', 'Chill slows 8% harder.', add('slowPower', 0.08)),
      w('lingering', 'Lingering Frost', 'Chill lasts 20% longer.', mult('statusDuration', 1.20)),
      w('icecore', 'Ice Core', 'Chill slows 8% harder.', add('slowPower', 0.08)),
      y('deepfreeze', 'Deep Freeze', 'Chill slows 18% harder.', add('slowPower', 0.18)),
      w('rime', 'Rime', 'Chill lasts 25% longer.', mult('statusDuration', 1.25)),
      r('hypothermia', 'Hypothermia', 'Chilled enemies take 10 damage per second for as long as the chill lasts.', add('frostbiteDamage', 10)),
      w('glacial', 'Glacial Rounds', 'Chill slows 8% harder.', add('slowPower', 0.08)),
      y('brittle', 'Brittle', 'Chilled enemies take 35% more damage from every source.', mult('damage', 1.35)),
      r('stasislock', 'STASIS LOCK', 'A chilled enemy below 20% health shatters instantly, chilling everything within 150 units of it. Chill slows a further 20% harder.', flag('stasis'), flag('shatterChain'), add('slowPower', 0.20))
    ],
    whiteout: [
      w('fog', 'Cold Fog', 'Everything within 150 units of you is chilled continuously.', flag('chillAura')),
      w('frontage', 'Frontage', 'Aura radius +20%.', mult('auraRadius', 1.20)),
      w('insulate', 'Insulation', '+25 max HP.', add('maxHp', 25)),
      y('blizzard', 'Blizzard', 'Aura radius +30%, and chill slows 10% harder.', mult('auraRadius', 1.30), add('slowPower', 0.10)),
      w('drift', 'Snowdrift', 'Aura radius +20%.', mult('auraRadius', 1.20)),
      r('cryonova', 'Cryo Nova', 'Every dash freezes everything within 190 units for 1.5s.', flag('cryoNova')),
      w('coldarmor', 'Cold Armour', '8% damage reduction.', add('armor', 0.08)),
      y('deepcold', 'Deep Cold', 'Chilled enemies take 10 damage per second.', add('frostbiteDamage', 10)),
      r('whiteout', 'WHITEOUT', 'Aura radius +70%, chill slows 20% harder, and chilled enemies take a further 10 damage per second.', mult('auraRadius', 1.70), add('slowPower', 0.20), add('frostbiteDamage', 10))
    ],
    sustained_permafrost: [
      y('frostlens', 'Frost Lens', 'Cryo Beam deals 8 more damage per second and chill slows 10% harder.', add('beamPower', 8), add('slowPower', 0.10)),
      r('shatterbeam', 'Shatter Beam', 'Chilled enemies take 10 damage per second, and Cryo Beam ramps to 3.6x at full contact time.', add('frostbiteDamage', 10), add('beamRamp', 0.8)),
      y('coldfocus', 'Cold Focus', 'Cryo Beam deals 10 more damage per second and chill lasts 25% longer.', add('beamPower', 10), mult('statusDuration', 1.25)),
      r('absolutebeam', 'ABSOLUTE ZERO', 'Cryo Beam ramps to 4.4x and deals 14 more damage per second; chilled enemies below 20% health shatter instantly.', add('beamRamp', 1.6), add('beamPower', 14), flag('stasis'))
    ],
    permafrost_whiteout: [
      y('frostfield', 'Frost Field', 'Aura radius +20% and chill slows 10% harder.', mult('auraRadius', 1.20), add('slowPower', 0.10)),
      r('glacierfield', 'Glacier Field', 'Everything within 150 units is chilled continuously and takes 10 damage per second.', flag('chillAura'), add('frostbiteDamage', 10)),
      y('novafrost', 'Nova Frost', 'Every dash freezes everything within 190 units, and chill lasts 25% longer.', flag('cryoNova'), mult('statusDuration', 1.25)),
      r('icecap', 'ICE AGE', 'Everything within 150 units is chilled, chilled enemies below 20% health shatter and chill their neighbours, and aura radius is 50% larger.', flag('chillAura'), flag('stasis'), flag('shatterChain'), mult('auraRadius', 1.50))
    ]
  });

  /* ============================================================ ARC ============================================================ */
  TREES.arc = tree('arc', 'ARC',
    w('root', 'Coil Primer', 'Primes the coil. Charge mode adds 1 more meter per hit.', add('meterGain', 1)),
    [
      arch('capacitor', 'Capacitor', '#8ad8ff',
        'Capacitor is about filling the meter. Live Windings adds meter per hit in Charge mode and Flywheel raises the rate of fire that feeds it, so a Discharge is never more than a few seconds away. It does nothing for the damage of the Discharge itself.',
        { difficulty: 'Low', damage: 'Medium', defense: 'Low', range: 'Medium', speed: 'High' }),
      arch('discharge', 'Discharge', '#ff8aff',
        'Discharge is about spending. Overcharge raises Discharge damage from 3.2x to 4.0x and Deep Reserve cuts the meter cost so a full bar lasts longer. Every point spent here is dead weight while you are in Charge mode, which is most of the fight.',
        { difficulty: 'Medium', damage: 'High', defense: 'Low', range: 'Medium', speed: 'Low' }),
      arch('conduction', 'Conduction', '#c8b4ff',
        'Conduction spreads whatever mode you are in. Lattice adds arcs to every hit, Staggering Arc slows anything an arc touches by 60% for 0.8s, and Full Current stops arcs losing damage per jump. It is the only lane that works equally well in both modes.',
        { difficulty: 'Low', damage: 'Medium', defense: 'Medium', range: 'High', speed: 'Medium' })
    ], {
    capacitor: [
      w('windings', 'Live Windings', 'Charge mode adds 1 more meter per hit.', add('meterGain', 1)),
      w('flywheel', 'Flywheel', '+8% fire rate.', mult('fireRate', 1.08)),
      w('busbar', 'Bus Bar', 'Charge mode adds 1 more meter per hit.', add('meterGain', 1)),
      y('fastcoil', 'Fast Coil', '+12% fire rate, and Charge mode adds 1 more meter per hit.', mult('fireRate', 1.12), add('meterGain', 1)),
      w('grounding', 'Grounding', '+25 max HP.', add('maxHp', 25)),
      r('staticfield', 'Static Field', 'Everything within 140 units takes 16 damage per second, and each tick fills the meter like any other hit.', flag('staticField')),
      w('throughput', 'Throughput', '+9% fire rate.', mult('fireRate', 1.09)),
      y('supercap', 'Supercapacitor', 'Charge mode adds 2 more meter per hit.', add('meterGain', 2)),
      r('powerplant', 'POWER PLANT', 'Charge mode adds 3 more meter per hit, +20% fire rate, and everything within 140 units takes 16 damage per second.', add('meterGain', 3), mult('fireRate', 1.20), flag('staticField'))
    ],
    discharge: [
      w('reserve', 'Reserve Cell', 'Discharge shots deal 3.6x instead of 3.2x.', add('dischargePower', 0.4)),
      w('conduit', 'Heavy Conduit', '+7% damage.', mult('damage', 1.07)),
      w('spark', 'Spark Gap', 'Discharge shots arc to 1 more enemy.', add('dischargeChain', 1)),
      y('overcharge', 'Overcharge', 'Discharge shots deal 4.0x instead of 3.2x.', add('dischargePower', 0.8)),
      w('insulation', 'Insulation', '+25 max HP.', add('maxHp', 25)),
      r('arcdash', 'Arc Dash', 'Dashing drags a live cable through everything you pass, dealing 60 damage plus a full set of arcs.', flag('arcDash'), flag('dashStrike')),
      w('capacitance', 'Capacitance', 'Discharge shots deal 3.6x instead of 3.2x.', add('dischargePower', 0.4)),
      y('deepreserve', 'Deep Reserve', 'Discharge shots arc to 2 more enemies and deal 3.6x instead of 3.2x.', add('dischargeChain', 2), add('dischargePower', 0.4)),
      r('annihilator', 'ANNIHILATOR', 'Discharge shots deal 5.4x instead of 3.2x and arc to 2 more enemies. Charge mode gains nothing from this.', add('dischargePower', 2.2), add('dischargeChain', 2))
    ],
    conduction: [
      w('conduct', 'Conduction', 'Every hit arcs to 1 more enemy.', add('chainCount', 1)),
      w('amp', 'Amplifier', 'Arcs deal 20% more damage.', mult('chainDamage', 1.20)),
      w('copper', 'Copper Core', 'Every hit arcs to 1 more enemy.', add('chainCount', 1)),
      y('lattice', 'Lattice', 'Every hit arcs to 1 more enemy and arcs deal 25% more damage.', add('chainCount', 1), mult('chainDamage', 1.25)),
      w('reach', 'Extended Reach', 'Every hit arcs to 1 more enemy.', add('chainCount', 1)),
      r('stagger', 'Staggering Arc', 'Anything an arc hits is slowed 60% for 0.8s.', flag('chainStun')),
      w('relay', 'Relay', 'Arcs deal 20% more damage.', mult('chainDamage', 1.20)),
      y('cascade', 'Cascade', 'Every hit arcs to 2 more enemies.', add('chainCount', 2)),
      r('fullcurrent', 'FULL CURRENT', 'Arcs stop losing damage per jump and hit as hard as the original, every hit arcs to 2 more enemies, and arcs slow by 60% for 0.8s.', flag('arcShot'), add('chainCount', 2), flag('chainStun'))
    ],
    capacitor_discharge: [
      y('quickvent', 'Quick Vent', '+10% fire rate and Discharge shots deal 3.6x instead of 3.2x.', mult('fireRate', 1.10), add('dischargePower', 0.4)),
      r('flipflop', 'Flip-Flop', 'Charge mode adds 2 more meter per hit and Discharge shots deal 4.0x instead of 3.2x, so swapping pays both ways.', add('meterGain', 2), add('dischargePower', 0.8)),
      y('reservoir', 'Reservoir', 'Charge mode adds 2 more meter per hit and Discharge arcs to 1 more enemy.', add('meterGain', 2), add('dischargeChain', 1)),
      r('perpetualcycle', 'PERPETUAL CYCLE', 'Charge mode adds 3 more meter per hit, Discharge shots deal 4.6x instead of 3.2x, and everything within 140 units takes 16 damage per second that also fills the meter.', add('meterGain', 3), add('dischargePower', 1.4), flag('staticField'))
    ],
    discharge_conduction: [
      y('forkedbolt', 'Forked Bolt', 'Discharge arcs to 1 more enemy and all arcs deal 20% more damage.', add('dischargeChain', 1), mult('chainDamage', 1.20)),
      r('chainreaction', 'Chain Reaction', 'Every kill releases an arc to 2 more enemies, and every hit arcs to 1 more.', add('killChainCount', 2), add('chainCount', 1)),
      y('conductor', 'Conductor', 'Arcs slow by 60% for 0.8s and Discharge shots deal 3.6x instead of 3.2x.', flag('chainStun'), add('dischargePower', 0.4)),
      r('thunderhead', 'THUNDERHEAD', 'Arcs hit as hard as the original shot, Discharge shots deal 4.6x and arc to 2 more enemies, and every kill releases 2 more arcs.', flag('arcShot'), add('dischargePower', 1.4), add('dischargeChain', 2), add('killChainCount', 2))
    ]
  });

  /* ============================================================ VEX ============================================================ */
  TREES.vex = tree('vex', 'VEX',
    w('root', 'Optic Uplink', 'Ranges the target. +4% critical hit chance.', add('critChance', 0.04)),
    [
      arch('windup', 'Wind-Up', '#ffd77a',
        'Wind-Up is about the held shot. Hair Spring cuts the time to a full charge from 0.91s to 0.63s and Heavy Charge raises a full shot from 3.2x to 4.0x. Holding the trigger produces no fire at all, so every point here makes the gaps between shots more expensive to waste.',
        { difficulty: 'High', damage: 'High', defense: 'Low', range: 'High', speed: 'Low' }),
      arch('penetration', 'Penetration', '#ff9a3d',
        'Penetration makes one round cover a line. Through and Through adds 2 pierce and stops damage falling off per body, and Lancer takes it to 6. It is worth nothing against a single target, so it wants crowds lined up.',
        { difficulty: 'Medium', damage: 'Medium', defense: 'Low', range: 'High', speed: 'Medium' }),
      arch('execution', 'Execution', '#ff5c6e',
        'Execution finishes what is already hurt. Executioner kills anything under 12% health outright, Death Mark brands every fifth hit for 50% extra damage, and Headhunter turns each kill into 1s of 25% extra fire rate. It contributes nothing to opening a fight.',
        { difficulty: 'Medium', damage: 'High', defense: 'Low', range: 'Medium', speed: 'Medium' })
    ], {
    windup: [
      w('spring', 'Hair Spring', 'The rifle reaches a full wind-up in 0.77s instead of 0.91s.', add('chargeRate', 0.2)),
      w('powder', 'Match Powder', 'A full wind-up deals 3.5x instead of 3.2x.', add('chargePower', 0.3)),
      w('brace', 'Shoulder Brace', '+7% damage.', mult('damage', 1.07)),
      y('heavycharge', 'Heavy Charge', 'A full wind-up deals 4.0x instead of 3.2x.', add('chargePower', 0.8)),
      w('spring2', 'Twin Spring', 'The rifle reaches a full wind-up 0.2s sooner.', add('chargeRate', 0.3)),
      r('steady', 'Steady Aim', 'Standing still for 0.5s guarantees the next shot is a critical hit, and critical hits deal +0.4x.', flag('steadyAim'), add('critDamage', 0.4)),
      w('grain', 'Fine Grain', 'A full wind-up deals 3.5x instead of 3.2x.', add('chargePower', 0.3)),
      y('release', 'Fast Release', 'The rifle reaches a full wind-up in about 0.5s, and a full shot deals 3.5x.', add('chargeRate', 0.5), add('chargePower', 0.3)),
      r('railgun', 'RAILGUN', 'A full wind-up deals 6.0x instead of 3.2x and passes through 3 more enemies at full damage. Snap shots are unchanged and still weak.', add('chargePower', 2.8), add('pierce', 3), flag('noFalloff'))
    ],
    penetration: [
      w('ap', 'AP Core', 'Rounds pass through 1 more enemy.', add('pierce', 1)),
      w('sabot', 'Sabot', '+8% damage.', mult('damage', 1.08)),
      w('rifling', 'Deep Rifling', '+5% critical hit chance.', add('critChance', 0.05)),
      y('through', 'Through and Through', 'Rounds pass through 2 more enemies and keep full damage through every one.', add('pierce', 2), flag('noFalloff')),
      w('tungsten', 'Tungsten', '+10% damage.', mult('damage', 1.10)),
      r('splitcore', 'Split Core', 'Every shot fires 1 more projectile. Each one deals 18% less damage.', add('projectiles', 1), mult('damage', 0.82)),
      w('hardpoint', 'Hardpoint', 'Rounds pass through 1 more enemy.', add('pierce', 1)),
      y('overpen', 'Overpenetration', 'Rounds pass through 2 more enemies.', add('pierce', 2)),
      r('lancer', 'LANCER', 'Rounds pass through 6 more enemies at full damage, and deal 30% more.', add('pierce', 6), flag('noFalloff'), mult('damage', 1.30))
    ],
    execution: [
      w('wound', 'Wound Channel', '+7% damage.', mult('damage', 1.07)),
      w('scan', 'Threat Scan', '+5% critical hit chance.', add('critChance', 0.05)),
      w('cull', 'Cull', 'Instantly kills enemies below 5% health.', add('execute', 0.05)),
      y('executioner', 'Executioner', 'Instantly kills enemies below 17% health. Bosses are immune.', flag('executioner'), add('execute', 0.05)),
      w('hollow', 'Hollow Points', 'Critical hits deal +0.3x.', add('critDamage', 0.30)),
      r('deathmark', 'Death Mark', 'Every fifth hit brands a target for 6s; a branded target takes 50% more damage from every source.', flag('deathMark')),
      w('bounty', 'Bounty Tags', '+15% score, which is also +15% cores banked.', add('scoreBonus', 0.15)),
      y('headhunter', 'Headhunter', 'Every kill grants 1s of +25% fire rate and heals you for 6.', flag('frenzy'), add('killHealAmount', 6)),
      r('terminator', 'TERMINATOR', 'Instantly kills enemies below 24% health, brands every fifth hit for 50% extra damage, and every kill detonates for 55.', add('execute', 0.12), flag('deathMark'), add('onKillBlast', 55))
    ],
    windup_penetration: [
      y('heavyround', 'Heavy Round', 'A full wind-up deals 3.6x, and rounds pass through 1 more enemy.', add('chargePower', 0.4), add('pierce', 1)),
      r('lancecharge', 'Lance Charge', 'A full wind-up deals 4.0x and rounds pass through 2 more enemies at full damage.', add('chargePower', 0.8), add('pierce', 2), flag('noFalloff')),
      y('quickpierce', 'Quick Pierce', 'The rifle winds up 0.2s sooner and rounds pass through 1 more enemy.', add('chargeRate', 0.3), add('pierce', 1)),
      r('spearofdawn', 'SPEAR OF DAWN', 'A full wind-up deals 5.2x and passes through 5 more enemies at full damage, and the rifle winds up in about 0.6s.', add('chargePower', 2.0), add('pierce', 5), flag('noFalloff'), add('chargeRate', 0.4))
    ],
    penetration_execution: [
      y('bleeder', 'Bleeder Rounds', 'Rounds pass through 1 more enemy and instantly kill below 5% health.', add('pierce', 1), add('execute', 0.05)),
      r('cullingline', 'Culling Line', 'Rounds pass through 2 more enemies at full damage and instantly kill below 12% health.', add('pierce', 2), flag('noFalloff'), flag('executioner')),
      y('marksline', 'Marked Line', 'Every fifth hit brands a target for 50% extra damage, and rounds pass through 1 more enemy.', flag('deathMark'), add('pierce', 1)),
      r('massexecution', 'MASS EXECUTION', 'Rounds pass through 4 more enemies at full damage, instantly kill below 22% health, and every kill detonates for 55.', add('pierce', 4), flag('noFalloff'), add('execute', 0.10), flag('executioner'), add('onKillBlast', 55))
    ]
  });

  /* ============================================================ NYX ============================================================ */
  TREES.nyx = tree('nyx', 'NYX',
    w('root', 'Servo Prime', 'Spins up the legs. +4% move speed, which is also +4% rate of fire.', mult('moveSpeed', 1.04)),
    [
      arch('velocity', 'Velocity', '#9dff5c',
        'Velocity is damage, because the Twin Pistols fire from your speed and nothing else. Servo Legs and Overdrive raise move speed, which raises rate of fire in lockstep; Bloodrush adds 30% more for 2s on every kill. Standing still still fires nothing, so it has no answer to being cornered.',
        { difficulty: 'Medium', damage: 'High', defense: 'Low', range: 'Medium', speed: 'High' }),
      arch('bladestorm', 'Bladestorm', '#cfe6ff',
        'Bladestorm adds damage that does not depend on speed at all. Orbit Blades ride a ring around you and cut anything that closes, and Cyclone takes the ring to six. It only reaches melee range, so it covers exactly the situation Velocity is worst at.',
        { difficulty: 'Low', damage: 'Medium', defense: 'Medium', range: 'Low', speed: 'Medium' }),
      arch('phase', 'Phase', '#7cffe0',
        'Phase turns the dash into the attack. Blink Protocol makes the dash deal 80 damage to everything it crosses, Phase Step adds 0.35s of invulnerability to it, and Reset refunds a charge on every kill. Dashing constantly also keeps your speed high, which keeps the pistols firing.',
        { difficulty: 'High', damage: 'Medium', defense: 'High', range: 'Low', speed: 'High' })
    ], {
    velocity: [
      w('light', 'Light Frame', '+6% move speed and rate of fire.', mult('moveSpeed', 1.06)),
      w('tread', 'Grip Tread', '+5% move speed and rate of fire.', mult('moveSpeed', 1.05)),
      w('twitch', 'Twitch Reflex', '+7% fire rate on top of whatever your speed provides.', mult('fireRate', 1.07)),
      y('servo', 'Servo Legs', '+14% move speed and rate of fire.', mult('moveSpeed', 1.14)),
      w('cadence', 'Cadence', '+8% fire rate.', mult('fireRate', 1.08)),
      r('bloodrush', 'Bloodrush', 'Every kill grants +30% move speed for 2s, which is also +30% rate of fire.', flag('adrenaline')),
      w('feather', 'Featherweight', '+6% move speed and rate of fire.', mult('moveSpeed', 1.06)),
      y('overdrive', 'Overdrive', '+12% move speed and +10% fire rate.', mult('moveSpeed', 1.12), mult('fireRate', 1.10)),
      r('perpetual', 'PERPETUAL MOTION', '+25% move speed and rate of fire, +20% fire rate, and every kill grants a further 30% speed for 2s.', mult('moveSpeed', 1.25), mult('fireRate', 1.20), flag('adrenaline'))
    ],
    bladestorm: [
      w('blade', 'First Blade', 'Two blades orbit you, dealing 22 damage on contact.', flag('bladestorm')),
      w('edge', 'Honed Edge', 'Orbit blades deal 10 more damage.', add('orbitDamage', 10)),
      w('balance', 'Balance', '+1 orbit blade.', add('orbitCount', 1)),
      y('whirl', 'Whirlwind', '+1 orbit blade, and blades deal 16 more damage.', add('orbitCount', 1), add('orbitDamage', 16)),
      w('serrate', 'Serrated', 'Orbit blades deal 12 more damage.', add('orbitDamage', 12)),
      r('bloodedge', 'Blood Edge', 'You heal for 6% of all damage dealt, and orbit blades deal 12 more damage.', add('lifesteal', 0.06), add('orbitDamage', 12)),
      w('spin', 'Spin Up', '+1 orbit blade.', add('orbitCount', 1)),
      y('cyclone', 'Cyclone', '+1 orbit blade, and blades deal 18 more damage.', add('orbitCount', 1), add('orbitDamage', 18)),
      r('bladestorm_cap', 'BLADESTORM', '+2 orbit blades and blades deal 30 more damage. Blades hit every 0.45s per enemy, so more blades means more frequent hits.', add('orbitCount', 2), add('orbitDamage', 30))
    ],
    phase: [
      w('coil', 'Phase Coil', 'Dash recharges 12% faster.', mult('dashCooldown', 0.88)),
      w('charge', 'Spare Charge', '+1 dash charge.', add('dashCharges', 1)),
      w('entry', 'Razor Entry', 'Dashing deals 40 damage to everything you pass through.', flag('dashStrike')),
      y('phasestep', 'Phase Step', 'Dashes grant 0.35s of invulnerability and recharge 15% faster.', flag('phaseDash'), mult('dashCooldown', 0.85)),
      w('slipstream', 'Slipstream', 'Dash recharges 15% faster.', mult('dashCooldown', 0.85)),
      r('blink', 'Blink Protocol', 'Dashing deals 80 damage to everything you cross and grants 0.1s more invulnerability.', flag('blink')),
      w('cutting', 'Cutting Entry', 'Dashes deal 50 more damage.', add('dashDamage', 50)),
      y('reset', 'Reset', 'Every kill refunds a dash charge, and you gain 1 more.', flag('dashRefund'), add('dashCharges', 1)),
      r('unseen', 'UNSEEN', '+2 dash charges, dashes deal 90 more damage, every kill refunds a charge, and dashes grant 0.35s of invulnerability.', add('dashCharges', 2), add('dashDamage', 90), flag('dashRefund'), flag('phaseDash'))
    ],
    velocity_bladestorm: [
      y('spinup', 'Rotor Spin', '+8% move speed and rate of fire, and +1 orbit blade.', mult('moveSpeed', 1.08), add('orbitCount', 1)),
      r('carousel', 'Carousel', '+2 orbit blades dealing 20 more damage, and +10% move speed and rate of fire.', add('orbitCount', 2), add('orbitDamage', 20), mult('moveSpeed', 1.10)),
      y('shear', 'Shear', 'Orbit blades deal 20 more damage and you heal for 3% of all damage dealt.', add('orbitDamage', 20), add('lifesteal', 0.03)),
      r('meatgrinder', 'MEAT GRINDER', '+3 orbit blades dealing 30 more damage, +20% move speed and rate of fire, and every kill grants 30% more speed for 2s.', add('orbitCount', 3), add('orbitDamage', 30), mult('moveSpeed', 1.20), flag('adrenaline'))
    ],
    bladestorm_phase: [
      y('bladedash', 'Blade Dash', 'Dashing deals 40 damage to everything you pass, and +1 orbit blade.', flag('dashStrike'), add('orbitCount', 1)),
      r('whirlblink', 'Whirl Blink', 'Dashes deal 80 damage to everything you cross, and orbit blades deal 20 more damage.', flag('blink'), add('orbitDamage', 20)),
      y('afterblade', 'Afterblade', 'Every kill refunds a dash charge, and +1 orbit blade.', flag('dashRefund'), add('orbitCount', 1)),
      r('stormpiercer', 'STORM PIERCER', '+2 orbit blades dealing 25 more damage, dashes deal 80 damage and grant 0.35s of invulnerability, and every kill refunds a charge.', add('orbitCount', 2), add('orbitDamage', 25), flag('blink'), flag('phaseDash'), flag('dashRefund'))
    ]
  });

  /* ============================================================ COG ============================================================ */
  TREES.cog = tree('cog', 'COG',
    w('root', 'Workshop Uplink', 'Spins up the fabricator. +1 drone.', add('droneCount', 1)),
    [
      arch('fabrication', 'Fabrication', '#b8c6d8',
        'Fabrication is drone count and drone rate. Assembly Line adds units, Rapid Servos cuts their fire interval by 15% a step, and Hive Mind takes both to the ceiling. Drone shots run the same modifiers your own do, so multishot and pierce are multiplied across the whole escort.',
        { difficulty: 'Low', damage: 'High', defense: 'Low', range: 'High', speed: 'Low' }),
      arch('command', 'Command', '#9dff5c',
        'Command is about the FOCUS order. Target Uplink extends it from 4s to 7s and Priority Fire raises focused damage from +40% to +90%, turning the escort into a single-target execution squad. Off cooldown it does nothing at all, so it rewards picking the right target.',
        { difficulty: 'High', damage: 'High', defense: 'Medium', range: 'High', speed: 'Medium' }),
      arch('ordnance', 'Ordnance', '#ff8a3d',
        'Ordnance arms the escort. Warheads make every drone round explode for 46 in a blast, Cluster Munitions splits each explosion into 3 bomblets, and Saturation makes the bomblets split again. Friendly explosions cannot hurt you, but the screen noise is the price.',
        { difficulty: 'Medium', damage: 'High', defense: 'Low', range: 'Medium', speed: 'Medium' })
    ], {
    fabrication: [
      w('assembly', 'Assembly Line', '+1 drone. Each drone fires every 0.55s for 14 damage.', add('droneCount', 1)),
      w('servos', 'Servos', 'Drones fire 10% faster.', mult('droneRate', 0.90)),
      w('calibrate', 'Calibration', '+5% critical hit chance, which drone shots also roll.', add('critChance', 0.05)),
      y('massproduce', 'Mass Production', '+1 drone, and drones fire 15% faster.', add('droneCount', 1), mult('droneRate', 0.85)),
      w('tuning', 'Tuning', '+8% damage, which drone shots also receive.', mult('damage', 1.08)),
      r('swarm', 'Swarm Protocol', '+2 drones and drones fire 15% faster.', add('droneCount', 2), mult('droneRate', 0.85)),
      w('overclock', 'Overclock', 'Drones fire 12% faster.', mult('droneRate', 0.88)),
      y('production', 'Production Line', '+1 drone, and that drone carries every modifier you own.', add('droneCount', 1)),
      r('hivemind', 'HIVE MIND', '+2 drones and drones fire 40% faster.', add('droneCount', 2), mult('droneRate', 0.60))
    ],
    command: [
      w('uplink', 'Target Uplink', 'FOCUS lasts 1s longer (4s to 5s).', add('focusTime', 1)),
      w('priority', 'Priority Fire', 'Focused drones deal +55% instead of +40%.', add('focusPower', 0.15)),
      w('relay', 'Command Relay', 'FOCUS lasts 1s longer.', add('focusTime', 1)),
      y('designator', 'Designator', 'Focused drones deal +70% instead of +40%, and FOCUS lasts 1s longer.', add('focusPower', 0.30), add('focusTime', 1)),
      w('repair', 'Repair Bots', 'Each drone repairs you for 1.2 HP per second.', add('droneRepair', 1.2)),
      r('killorder', 'Kill Order', 'Focused drones deal +90% instead of +40%, and every fifth hit brands a target for 50% extra damage.', add('focusPower', 0.50), flag('deathMark')),
      w('shielding', 'Shield Generator', 'Each drone grants you 20 shield.', flag('droneShield')),
      y('overwatch', 'Overwatch', 'FOCUS lasts 2s longer and focused drones deal +55% instead of +40%.', add('focusTime', 2), add('focusPower', 0.15)),
      r('warmachine', 'WAR MACHINE', 'Focused drones deal +140% instead of +40%, FOCUS lasts 7s, and every kill heals you for 6.', add('focusPower', 1.0), add('focusTime', 3), add('killHealAmount', 6))
    ],
    ordnance: [
      w('payload', 'Payload', '+7% damage.', mult('damage', 1.07)),
      w('warhead', 'Warheads', 'Drone rounds explode for 46 damage on impact.', flag('droneBoom')),
      w('propellant', 'Propellant', 'Explosions are 15% larger.', mult('explosionSize', 1.15)),
      y('demolition', 'Demolition Package', 'Explosions deal 25% more damage and are 15% larger.', mult('explosionDamage', 1.25), mult('explosionSize', 1.15)),
      w('shrapnel', 'Shrapnel', 'Explosions are 15% larger.', mult('explosionSize', 1.15)),
      r('cluster', 'Cluster Munitions', 'Every explosion throws 3 bomblets that each explode for 55% of the original damage.', add('clusterCount', 3)),
      w('highyield', 'High Yield', 'Explosions deal 20% more damage.', mult('explosionDamage', 1.20)),
      y('saturation', 'Saturation', 'Bomblets throw bomblets of their own, and explosions throw 2 more.', flag('carpet'), add('clusterCount', 2)),
      r('bombardment', 'BOMBARDMENT', 'Drone rounds explode for 46, every explosion throws 3 bomblets, and explosions are 40% larger.', flag('droneBoom'), add('clusterCount', 3), mult('explosionSize', 1.40))
    ],
    fabrication_command: [
      y('taskforce', 'Task Force', '+1 drone and FOCUS lasts 1s longer.', add('droneCount', 1), add('focusTime', 1)),
      r('strikewing', 'Strike Wing', '+2 drones and focused drones deal +70% instead of +40%.', add('droneCount', 2), add('focusPower', 0.30)),
      y('tightbeam', 'Tight Beam', 'Drones fire 15% faster and FOCUS lasts 2s longer.', mult('droneRate', 0.85), add('focusTime', 2)),
      r('deathsquad', 'DEATH SQUAD', '+3 drones firing 25% faster, focused drones deal +90% instead of +40%, and FOCUS lasts 6s.', add('droneCount', 3), mult('droneRate', 0.75), add('focusPower', 0.50), add('focusTime', 2))
    ],
    command_ordnance: [
      y('markedtarget', 'Marked Target', 'Focused drones deal +55% instead of +40%, and explosions are 15% larger.', add('focusPower', 0.15), mult('explosionSize', 1.15)),
      r('callinstrike', 'Called Strike', 'Drone rounds explode for 46 and focused drones deal +70% instead of +40%.', flag('droneBoom'), add('focusPower', 0.30)),
      y('firemission', 'Fire Mission', 'Explosions deal 25% more damage and FOCUS lasts 2s longer.', mult('explosionDamage', 1.25), add('focusTime', 2)),
      r('orbitalsupport', 'ORBITAL SUPPORT', 'Drone rounds explode for 46, every explosion throws 3 bomblets, and focused drones deal +90% instead of +40%.', flag('droneBoom'), add('clusterCount', 3), add('focusPower', 0.50))
    ]
  });

  /* ============================================================ BOOM ============================================================ */
  TREES.boom = tree('boom', 'BOOM',
    w('root', 'Ordnance Uplink', 'Checks the fuses. Explosions are 5% larger.', mult('explosionSize', 1.05)),
    [
      arch('payload', 'Payload', '#ff6b4a',
        'Payload makes each shell bigger. High Explosive stacks blast damage and radius, and Fat Man turns every sixth shell into a 2.4x radius, 3x damage round. It fires no faster, so a missed shell is a long wait.',
        { difficulty: 'Low', damage: 'High', defense: 'Low', range: 'Medium', speed: 'Low' }),
      arch('submunitions', 'Submunitions', '#ffc857',
        'Submunitions turns one shell into a pattern. Cluster Pack throws 3 bomblets from every explosion and Saturation makes those bomblets split again, covering ground you never aimed at. The bomblets land where they like, so it is unreliable against one moving target.',
        { difficulty: 'Medium', damage: 'High', defense: 'Low', range: 'Medium', speed: 'Medium' }),
      arch('shockwave', 'Shockwave', '#8ad8ff',
        'Shockwave uses the blast to hold the room. Shock Plate slows anything that survives an explosion by 50% for 2s, Gravity Well drags them in, and Stasis shatters the slowed survivors below 20% health. It converts your damage into control, so it kills slower on purpose.',
        { difficulty: 'Medium', damage: 'Medium', defense: 'High', range: 'Medium', speed: 'Low' })
    ], {
    payload: [
      w('charge', 'Bigger Charge', 'Explosions deal 15% more damage.', mult('explosionDamage', 1.15)),
      w('casing', 'Thin Casing', 'Explosions are 12% larger.', mult('explosionSize', 1.12)),
      w('fuse', 'Fast Fuse', '+8% fire rate.', mult('fireRate', 1.08)),
      y('he', 'High Explosive', 'Explosions deal 30% more damage and are 15% larger.', mult('explosionDamage', 1.30), mult('explosionSize', 1.15)),
      w('tamper', 'Tamper Plate', 'Explosions deal 18% more damage.', mult('explosionDamage', 1.18)),
      r('fatman', 'Fat Man', 'Every sixth shell is a mega shell: 2.4x radius and 3x damage. The five shells between are unchanged.', flag('megaShell')),
      w('propel', 'Propellant', 'Explosions are 15% larger.', mult('explosionSize', 1.15)),
      y('overcharge', 'Overcharge', 'Explosions deal 30% more damage and are 10% larger.', mult('explosionDamage', 1.30), mult('explosionSize', 1.10)),
      r('daisycutter', 'DAISY CUTTER', 'Explosions are 80% larger and deal 50% more damage, and every sixth shell is a mega shell.', mult('explosionSize', 1.80), mult('explosionDamage', 1.50), flag('megaShell'))
    ],
    submunitions: [
      w('bomblet', 'Bomblets', 'Every explosion throws 3 bomblets dealing 55% of its damage.', add('clusterCount', 3)),
      w('scatter', 'Scatter Pack', 'Explosions are 12% larger.', mult('explosionSize', 1.12)),
      w('timer', 'Short Timers', '+7% fire rate.', mult('fireRate', 1.07)),
      y('clusterpack', 'Cluster Pack', 'Explosions throw 2 more bomblets and deal 20% more damage.', add('clusterCount', 2), mult('explosionDamage', 1.20)),
      w('spread', 'Wide Pattern', 'Explosions are 15% larger.', mult('explosionSize', 1.15)),
      r('carpet', 'Carpet Bombing', 'Bomblets throw bomblets of their own, one layer deeper. Capped at 80 live bomblets.', flag('carpet')),
      w('filler', 'Dense Filler', 'Explosions deal 18% more damage.', mult('explosionDamage', 1.18)),
      y('saturation', 'Saturation', 'Explosions throw 3 more bomblets.', add('clusterCount', 3)),
      r('steelrain', 'STEEL RAIN', 'Explosions throw 4 more bomblets, bomblets split again, and explosions deal 40% more damage.', add('clusterCount', 4), flag('carpet'), mult('explosionDamage', 1.40))
    ],
    shockwave: [
      w('concussion', 'Concussion', 'Slows applied by any source slow 20% harder.', add('slowPower', 0.20)),
      w('bracing', 'Bracing', '6% damage reduction.', add('armor', 0.06)),
      w('overpressure', 'Overpressure', 'Slows last 25% longer.', mult('statusDuration', 1.25)),
      y('shockplate', 'Shock Plate', 'Anything that survives one of your explosions is slowed 50% for 2s.', flag('gravityWell'), add('slowPower', 0.15)),
      w('blastshield', 'Blast Shield', '8% damage reduction.', add('armor', 0.08)),
      r('demodash', 'Demo Dash', 'Every dash ends in a 90-damage explosion and deals 50 damage to everything you cross.', flag('dashBlast'), flag('dashStrike')),
      w('resonance', 'Resonance', 'Slows slow 15% harder.', add('slowPower', 0.15)),
      y('groundzero', 'Ground Zero', 'Slows last 30% longer and slow 20% harder.', mult('statusDuration', 1.30), add('slowPower', 0.20)),
      r('seismic', 'SEISMIC', 'Explosion survivors are slowed 50% for 2s, slowed enemies below 20% health shatter, and explosions are 40% larger.', flag('gravityWell'), flag('stasis'), mult('explosionSize', 1.40))
    ],
    payload_submunitions: [
      y('heavycluster', 'Heavy Cluster', 'Explosions throw 2 more bomblets and deal 20% more damage.', add('clusterCount', 2), mult('explosionDamage', 1.20)),
      r('mother', 'Mother Shell', 'Every sixth shell is a mega shell, and every explosion throws 3 bomblets.', flag('megaShell'), add('clusterCount', 3)),
      y('widepattern', 'Wide Pattern', 'Explosions are 25% larger and throw 1 more bomblet.', mult('explosionSize', 1.25), add('clusterCount', 1)),
      r('carpetnuke', 'CARPET NUKE', 'Every sixth shell is a mega shell, explosions throw 4 more bomblets that split again, and blasts are 30% larger.', flag('megaShell'), add('clusterCount', 4), flag('carpet'), mult('explosionSize', 1.30))
    ],
    submunitions_shockwave: [
      y('minefield', 'Minefield', 'Explosions throw 2 more bomblets and slows slow 15% harder.', add('clusterCount', 2), add('slowPower', 0.15)),
      r('quagmire', 'Quagmire', 'Explosion survivors are slowed 50% for 2s, and every explosion throws 3 bomblets.', flag('gravityWell'), add('clusterCount', 3)),
      y('tremor', 'Tremor', 'Slows last 30% longer and explosions are 20% larger.', mult('statusDuration', 1.30), mult('explosionSize', 1.20)),
      r('nomansland', "NO MAN'S LAND", 'Explosions throw 4 more splitting bomblets, survivors are slowed 50% for 2s, and slowed enemies below 20% health shatter.', add('clusterCount', 4), flag('carpet'), flag('gravityWell'), flag('stasis'))
    ]
  });

  /* ============================================================ MOURN ============================================================ */
  TREES.mourn = tree('mourn', 'MOURN',
    w('root', "Reaper's Pact", 'Signs it. You heal for 2% of all damage dealt.', add('lifesteal', 0.02)),
    [
      arch('hunger', 'Hunger', '#d08bff',
        'Hunger keeps a 75 HP operative alive by feeding. Feeding Frenzy raises lifesteal to 5% of all damage, Exsanguinate heals 6 per kill, and Undying adds a once-per-wave survival at 25 HP. Every point spent here is a point not spent on the damage that makes the lifesteal worth anything.',
        { difficulty: 'Medium', damage: 'Low', defense: 'High', range: 'Low', speed: 'Medium' }),
      arch('wrath', 'Wrath', '#ff5c6e',
        'Wrath pays you for being nearly dead. Blood Rage adds 5% damage per 10% missing HP and Death Wish strips 25 max HP to add 45% damage outright. It fights Hunger directly: healing back up turns Wrath off.',
        { difficulty: 'High', damage: 'High', defense: 'Low', range: 'Low', speed: 'Medium' }),
      arch('harvest', 'Harvest', '#8affb0',
        'Harvest turns kills into resources. Reaping drops soul orbs that heal 6, Soul Reaper adds 1s of +25% fire rate per kill, and Mass Grave makes every corpse detonate for 55. It needs a crowd; against one boss it produces nothing.',
        { difficulty: 'Low', damage: 'Medium', defense: 'Medium', range: 'Medium', speed: 'High' })
    ], {
    hunger: [
      w('bite', 'First Bite', 'You heal for 3% more of all damage dealt.', add('lifesteal', 0.03)),
      w('thirst', 'Thirst', 'You heal for 3% more of all damage dealt.', add('lifesteal', 0.03)),
      w('vitality', 'Vitality', '+25 max HP.', add('maxHp', 25)),
      y('feed', 'Feeding Frenzy', 'You heal for 5% more of all damage dealt and deal 10% more damage.', add('lifesteal', 0.05), mult('damage', 1.10)),
      w('gorge', 'Gorge', 'You heal for 3% more of all damage dealt.', add('lifesteal', 0.03)),
      r('exsanguinate', 'Exsanguinate', 'Every kill heals you for 6, and you heal for 3% more of all damage dealt.', add('killHealAmount', 6), add('lifesteal', 0.03)),
      w('sate', 'Sated', '+30 max HP.', add('maxHp', 30)),
      y('glut', 'Glutton', 'You heal for 6% more of all damage dealt.', add('lifesteal', 0.06)),
      r('undying', 'UNDYING', 'You heal for 8% more of all damage dealt, every kill heals 6, and once per wave a killing blow leaves you at 25 HP with 1.6s of invulnerability.', add('lifesteal', 0.08), add('killHealAmount', 6), flag('secondWind'))
    ],
    wrath: [
      w('spite', 'Spite', '+3% damage per 10% of max HP missing, up to +30%.', add('berserk', 0.03)),
      w('fury', 'Fury', '+7% damage.', mult('damage', 1.07)),
      w('scar', 'Scar Tissue', '6% damage reduction.', add('armor', 0.06)),
      y('bloodrage', 'Blood Rage', '+5% damage per 10% of max HP missing, up to +50%.', add('berserk', 0.05)),
      w('reckless', 'Reckless', '+10% damage.', mult('damage', 1.10)),
      r('deathwish', 'Death Wish', '+45% damage and -25 max HP. On a 75 HP operative that is a third of your health.', mult('damage', 1.45), add('maxHp', -25)),
      w('adrenal', 'Adrenal Spike', '+20% move speed while below 40% health.', flag('desperate')),
      y('malice', 'Malice', '+12% damage and +3% damage per 10% missing HP.', mult('damage', 1.12), add('berserk', 0.03)),
      r('wrathincarnate', 'WRATH INCARNATE', '+8% damage per 10% missing HP (up to +80%), +20% damage, and +20% move speed below 40% health.', add('berserk', 0.08), mult('damage', 1.20), flag('desperate'))
    ],
    harvest: [
      w('gleaner', 'Gleaner', 'Kills drop soul orbs that heal 6 on pickup.', add('soulHeal', 6)),
      w('pull', 'Soul Pull', 'Pickups are drawn from 70 units further away.', add('magnet', 70)),
      w('toll', 'Toll', '+15% score, which is also +15% cores banked.', add('scoreBonus', 0.15)),
      y('reaping', 'Reaping', 'Soul orbs heal 6 more, and 60% more pickups drop.', add('soulHeal', 6), add('dropBonus', 0.6)),
      w('wake', 'Wake', 'You regenerate 1 HP per second.', add('regen', 1.0)),
      r('soulreaper', 'Soul Reaper', 'Every kill grants 1s of +25% fire rate and heals you for 6.', flag('frenzy'), add('killHealAmount', 6)),
      w('harvester', 'Harvester', '50% more pickups drop.', add('dropBonus', 0.5)),
      y('massgrave', 'Mass Grave', 'Every kill detonates for 55 damage in an 80-unit radius.', add('onKillBlast', 55)),
      r('endless', 'ENDLESS HARVEST', 'Every kill heals 6, grants 1s of +25% fire rate, and detonates for 55 damage.', add('killHealAmount', 6), flag('frenzy'), add('onKillBlast', 55))
    ],
    hunger_wrath: [
      y('bloodprice', 'Blood Price', 'You heal for 3% more of all damage dealt and gain +3% damage per 10% missing HP.', add('lifesteal', 0.03), add('berserk', 0.03)),
      r('bloodpact', 'Blood Pact', '+5% damage per 10% missing HP and you heal for 5% more of all damage dealt, so the damage climbs while the healing holds you there.', add('berserk', 0.05), add('lifesteal', 0.05)),
      y('rend', 'Rend', '+12% damage and you heal for 3% more of all damage dealt.', mult('damage', 1.12), add('lifesteal', 0.03)),
      r('crimsontide', 'CRIMSON TIDE', '+6% damage per 10% missing HP, 8% more lifesteal, and once per wave a killing blow leaves you at 25 HP.', add('berserk', 0.06), add('lifesteal', 0.08), flag('secondWind'))
    ],
    wrath_harvest: [
      y('cullingrage', 'Culling Rage', '+3% damage per 10% missing HP, and every kill heals 6.', add('berserk', 0.03), add('killHealAmount', 6)),
      r('deathspiral', 'Death Spiral', 'Every kill grants 1s of +25% fire rate and detonates for 55 damage.', flag('frenzy'), add('onKillBlast', 55)),
      y('bloodharvest', 'Blood Harvest', '+12% damage and soul orbs heal 6 more.', mult('damage', 1.12), add('soulHeal', 6)),
      r('apocalypse', 'APOCALYPSE', '+6% damage per 10% missing HP, every kill detonates for 55 and grants 1s of +25% fire rate, and +20% speed below 40% health.', add('berserk', 0.06), add('onKillBlast', 55), flag('frenzy'), flag('desperate'))
    ]
  });

  /* ============================================================ IRIS ============================================================ */
  TREES.iris = tree('iris', 'IRIS',
    w('root', 'Prism Array', 'Splits the beam. +1 projectile per shot.', add('projectiles', 1)),
    [
      arch('refraction', 'Refraction', '#7cffe0',
        'Refraction makes the walls part of the weapon. Carom adds wall bounces, Split Beam divides a shot in two on every bounce, and Amplify adds 30% damage per bounce instead of losing it. In open ground with no walls to work with, it does nothing.',
        { difficulty: 'High', damage: 'High', defense: 'Low', range: 'High', speed: 'Medium' }),
      arch('seeker', 'Seeker', '#6ec6ff',
        'Seeker removes aiming from the equation. Tracker curves every shot toward the nearest enemy and Relentless adds pierce so a curving round keeps working after the first body. It steers toward whatever is closest, which is not always what you wanted dead.',
        { difficulty: 'Low', damage: 'Medium', defense: 'Low', range: 'High', speed: 'Medium' }),
      arch('spectrum', 'Spectrum', '#e08bff',
        'Spectrum is raw projectile count. Full Spectrum adds beams and rate, and Scatter Array adds three more at 30% less damage each. Every projectile carries every on-hit effect you own, so it multiplies burn, chain and bounce alike - and it empties the screen budget fastest.',
        { difficulty: 'Low', damage: 'High', defense: 'Low', range: 'Medium', speed: 'High' })
    ], {
    refraction: [
      w('bounce', 'First Bounce', 'Shots bounce off walls 1 more time.', add('bounces', 1)),
      w('angle', 'Angle Optics', '+6% damage.', mult('damage', 1.06)),
      w('carom', 'Carom', 'Shots bounce off walls 1 more time.', add('bounces', 1)),
      y('refract', 'Refraction', 'Shots bounce 1 more time and gain 30% damage per bounce instead of losing it.', add('bounces', 1), flag('amplify')),
      w('polish', 'Polished Core', '+8% damage.', mult('damage', 1.08)),
      r('splitbeam', 'Split Beam', 'Every bounce splits the shot into 2, each dealing 60% of the parent. Capped at 180 live projectiles.', flag('bounceSplit')),
      w('mirror', 'Mirror Finish', 'Shots bounce off walls 1 more time.', add('bounces', 1)),
      y('resonant', 'Resonant Cavity', 'Shots bounce 2 more times and gain 30% damage per bounce.', add('bounces', 2), flag('amplify')),
      r('kaleidoscope', 'KALEIDOSCOPE', 'Shots bounce 2 more times, split in two on every bounce, and gain 30% damage per bounce.', add('bounces', 2), flag('bounceSplit'), flag('amplify'))
    ],
    seeker: [
      w('tracker', 'Tracker', 'Shots curve toward the nearest enemy within 460 units.', add('homingStrength', 2.6)),
      w('lens', 'Focus Lens', '+8% damage.', mult('damage', 1.08)),
      w('gyro', 'Gyro Stabiliser', 'Shots curve 2.6 faster toward their target.', add('homingStrength', 2.6)),
      y('seeking', 'Seeking Optics', 'Shots curve 2.6 faster and deal 12% more damage.', add('homingStrength', 2.6), mult('damage', 1.12)),
      w('guidance', 'Guidance', '+5% critical hit chance.', add('critChance', 0.05)),
      r('swarmfire', 'Swarm Fire', '+2 projectiles that each deal 22% less damage, all of them homing.', add('projectiles', 2), mult('damage', 0.78), add('homingStrength', 2.6)),
      w('sensor', 'Sensor Pod', '+8% damage.', mult('damage', 1.08)),
      y('relentless', 'Relentless', 'Shots pass through 2 more enemies and curve 2.6 faster.', add('pierce', 2), add('homingStrength', 2.6)),
      r('inescapable', 'INESCAPABLE', 'Shots curve 5.2 faster, pass through 3 more enemies, and deal 25% more damage.', add('homingStrength', 5.2), add('pierce', 3), mult('damage', 1.25))
    ],
    spectrum: [
      w('split', 'Split', '+1 projectile per shot.', add('projectiles', 1)),
      w('coherence', 'Coherence', '+7% damage.', mult('damage', 1.07)),
      w('cycle', 'Fast Cycle', '+8% fire rate.', mult('fireRate', 1.08)),
      y('spectrum', 'Full Spectrum', '+1 projectile and +10% fire rate.', add('projectiles', 1), mult('fireRate', 1.10)),
      w('prismatic', 'Prismatic', '+8% damage.', mult('damage', 1.08)),
      r('scatter', 'Scatter Array', '+3 projectiles per shot. Every projectile deals 30% less damage.', add('projectiles', 3), mult('damage', 0.70)),
      w('rapid', 'Rapid Array', '+10% fire rate.', mult('fireRate', 1.10)),
      y('overdrive', 'Overdrive', '+18% fire rate.', mult('fireRate', 1.18)),
      r('whitelight', 'WHITE LIGHT', '+2 projectiles, +20% fire rate and +15% damage.', add('projectiles', 2), mult('fireRate', 1.20), mult('damage', 1.15))
    ],
    refraction_seeker: [
      y('curvedmirror', 'Curved Mirror', 'Shots bounce 1 more time and curve 2.6 faster.', add('bounces', 1), add('homingStrength', 2.6)),
      r('ricochethunt', 'Ricochet Hunt', 'Shots bounce 2 more times, gain 30% damage per bounce, and curve toward targets after each bounce.', add('bounces', 2), flag('amplify'), add('homingStrength', 2.6)),
      y('trackingcarom', 'Tracking Carom', 'Shots pass through 1 more enemy and bounce 1 more time.', add('pierce', 1), add('bounces', 1)),
      r('impossibleangle', 'IMPOSSIBLE ANGLE', 'Shots bounce 3 more times, split on every bounce, curve 2.6 faster, and gain 30% damage per bounce.', add('bounces', 3), flag('bounceSplit'), add('homingStrength', 2.6), flag('amplify'))
    ],
    seeker_spectrum: [
      y('scattertrack', 'Scatter Track', '+1 projectile, all of them curving toward targets.', add('projectiles', 1), add('homingStrength', 2.6)),
      r('flock', 'Flock', '+2 projectiles that curve 2.6 faster and pass through 1 more enemy.', add('projectiles', 2), add('homingStrength', 2.6), add('pierce', 1)),
      y('wideseek', 'Wide Seek', '+12% fire rate and shots curve 2.6 faster.', mult('fireRate', 1.12), add('homingStrength', 5.2)),
      r('starfall', 'STARFALL', '+3 projectiles curving 5.2 faster, +15% fire rate, and shots pass through 2 more enemies. Each projectile deals 15% less.', add('projectiles', 3), add('homingStrength', 5.2), mult('fireRate', 1.15), add('pierce', 2), mult('damage', 0.85))
    ]
  });

  /* ============================================================ VESSEL ============================================================ */
  TREES.vessel = tree('vessel', 'VESSEL',
    w('root', 'First Binding', 'Opens the pact. Essence regenerates 2 more per second (8 to 10).', add('essenceRegen', 2)),
    [
      arch('legion', 'Legion', '#b58cff',
        'Legion wins on headcount. Swarm Call and Horde raise the thrall cap while Cheap Rite drops the essence a binding costs, so the field is never empty. Each thrall is no tougher for it, so a Legion build loses its whole army to one boss sweep.',
        { difficulty: 'Low', damage: 'High', defense: 'Medium', range: 'Medium', speed: 'High' }),
      arch('bond', 'Bond', '#8affb0',
        'Bond makes the few thralls you have survive. Soul Link heals you for 25% of everything they deal, Reinforced Husk raises their health, and Phylactery returns any thrall an enemy kills after 6 seconds. It adds no thralls at all, so the damage ceiling is lower than Legion.',
        { difficulty: 'Medium', damage: 'Medium', defense: 'High', range: 'Low', speed: 'Low' }),
      arch('consumption', 'Consumption', '#ff6b9d',
        'Consumption treats thralls as ammunition. CONSUME detonates the nearest one for 120 and heals you 25, Unstable Thralls makes any death a 90-damage blast, and Greedy Rite refunds the essence to bind the next. Spending your army is the damage, so Consumption is always one bad trade from standing alone.',
        { difficulty: 'High', damage: 'High', defense: 'Low', range: 'Medium', speed: 'Medium' })
    ], {
    legion: [
      w('vessel2', 'Second Vessel', '+1 thrall.', add('minionCount', 1)),
      w('quickrite', 'Quick Rite', 'The sigil binds 20% faster (0.35s to 0.29s between thralls).', mult('fireRate', 1.20)),
      w('cheaprite', 'Cheap Rite', 'Binding costs 4 less essence (25 to 21).', add('summonCost', -4)),
      y('swarmcall', 'Swarm Call', '+1 thrall, and binding costs 4 less essence.', add('minionCount', 1), add('summonCost', -4)),
      w('restless', 'Restless Dead', 'Thralls move 12% faster.', mult('minionSpeed', 1.12)),
      r('endlesshost', 'Endless Host', '+2 thralls, and essence regenerates 4 more per second.', add('minionCount', 2), add('essenceRegen', 4)),
      w('freshbind', 'Fresh Bindings', 'Essence regenerates 3 more per second.', add('essenceRegen', 3)),
      y('horde', 'Horde', '+1 thrall, and thralls strike 15% faster (0.75s to 0.64s).', add('minionCount', 1), mult('minionRate', 0.85)),
      r('legioncap', 'LEGION', '+3 thralls, binding costs 10 less essence, and essence regenerates 6 more per second. Thralls gain no health from this.', add('minionCount', 3), add('summonCost', -10), add('essenceRegen', 6))
    ],
    bond: [
      w('husk', 'Reinforced Husk', 'Thralls have 25 more health (60 to 85).', add('minionHealth', 25)),
      w('claws', 'Sharp Claws', 'Thralls deal 6 more damage per strike (20 to 26).', add('minionDamage', 6)),
      w('warded', 'Warded Flesh', 'Thralls have 25 more health.', add('minionHealth', 25)),
      y('soullink', 'Soul Link', 'You heal for 25% of all damage your thralls deal.', flag('soulLink')),
      w('boneplate', 'Bone Plate', 'Thralls have 30 more health.', add('minionHealth', 30)),
      r('bloodbond', 'Blood Bond', 'Thralls deal 14 more damage per strike, and you heal for 25% of it.', add('minionDamage', 14), flag('soulLink')),
      w('ironclaws', 'Iron Claws', 'Thralls deal 8 more damage per strike.', add('minionDamage', 8)),
      y('phylactery', 'Phylactery', 'A thrall killed by an enemy returns 6 seconds later at no cost. Thralls you consume do not return.', flag('phylactery')),
      r('eternalbond', 'ETERNAL BOND', 'Thralls have 60 more health and deal 20 more damage per strike, and you heal for 25% of everything they deal.', add('minionHealth', 60), add('minionDamage', 20), flag('soulLink'))
    ],
    consumption: [
      w('volatile', 'Volatile Remains', 'CONSUME detonates for 40 more damage (120 to 160).', add('consumePower', 40)),
      w('siphon', 'Siphon', 'CONSUME heals 15 more (25 to 40).', add('consumeHeal', 15)),
      w('greedy', 'Greedy Rite', 'Each kill returns 6 more essence (12 to 18).', add('essenceOnKill', 6)),
      y('cannibal', 'Cannibal Rite', 'CONSUME detonates for 60 more damage and heals 15 more.', add('consumePower', 60), add('consumeHeal', 15)),
      w('echoing', 'Echoing Blast', 'Explosions are 15% larger.', mult('explosionSize', 1.15)),
      r('unstable', 'Unstable Thralls', 'Any thrall that dies detonates for 90 damage in a 110-unit radius, however it died.', flag('thrallBurst')),
      w('deepwells', 'Deep Wells', 'Essence regenerates 3 more per second.', add('essenceRegen', 3)),
      y('warcry', 'War Cry', 'RALLY lasts 2s longer and thralls strike twice as fast during it, up from 50% faster.', add('rallyTime', 2), add('rallyPower', 0.5)),
      r('masssacrifice', 'MASS SACRIFICE', 'CONSUME detonates for 160 more damage and returns 30 more essence, and any dying thrall detonates for 90.', add('consumePower', 160), add('consumeRefund', 30), flag('thrallBurst'))
    ],
    legion_bond: [
      y('gravehost', 'Grave Host', '+1 thrall, and thralls have 25 more health.', add('minionCount', 1), add('minionHealth', 25)),
      r('deathless', 'Deathless Horde', '+1 thrall, and any thrall an enemy kills returns 6 seconds later.', add('minionCount', 1), flag('phylactery')),
      y('packstrength', 'Pack Strength', 'Thralls deal 10 more damage per strike and move 10% faster.', add('minionDamage', 10), mult('minionSpeed', 1.10)),
      r('unending', 'UNENDING LEGION', '+2 thralls with 40 more health that return 6 seconds after an enemy kills them.', add('minionCount', 2), add('minionHealth', 40), flag('phylactery'))
    ],
    bond_consumption: [
      y('bitterharvest', 'Bitter Harvest', 'CONSUME heals 15 more, and thralls have 20 more health.', add('consumeHeal', 15), add('minionHealth', 20)),
      r('sacrificiallink', 'Sacrificial Link', 'You heal for 25% of all thrall damage, and any dying thrall detonates for 90.', flag('soulLink'), flag('thrallBurst')),
      y('reclamation', 'Reclamation', 'CONSUME returns 20 more essence and heals 15 more.', add('consumeRefund', 20), add('consumeHeal', 15)),
      r('bloodengine', 'BLOOD ENGINE', 'Thralls deal 16 more damage and you heal for 25% of it; every thrall that dies detonates for 90 and returns 20 essence.', add('minionDamage', 16), flag('soulLink'), flag('thrallBurst'), add('consumeRefund', 20))
    ]
  });

  const DEFAULT_CHAR = 'vanguard';
  return { TREES, DEFAULT_CHAR, STAT_BASE, FLAGS, TIER_COST, TIER_LABEL, COLS };
});
