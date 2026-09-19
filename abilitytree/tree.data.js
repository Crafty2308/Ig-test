/* ============================================================
   ability tree - DATA
   Pure data. No logic, no DOM. Safe to edit by hand.

   node = {
     id, name, desc,
     tier:      'white' | 'yellow' | 'red'   -> drives cost, colour, tooltip framing
     archetype: 'onslaught' | 'dominion' | 'kinesis' | null  (null = neutral, white only)
     col, row:  fixed column grid, rows unbounded
     parents:   [id]   - at least one must be unlocked (root = [])
     blocks:    [id]   - taking this permanently locks those, until reset
     reqs:      { archetypeMin: {name, count}, pointsSpentMin: n }
     effect:    {stat, op:'add'|'mult', value} | {flag:'name'}
     effects:   [ ...same... ]   - optional list when one node does two things
   }
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbilityTreeData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* cost is a function of tier - never stored per node */
  const TIER_COST = { white: 1, yellow: 2, red: 4 };

  const TIER_LABEL = {
    white:  'Minor',
    yellow: 'Modifier',
    red:    'Build-defining'
  };

  const ARCHETYPES = {
    onslaught: { id: 'onslaught', name: 'Onslaught', color: '#ff5c6e', blurb: 'Aggression. Kill it before it reaches you.' },
    dominion:  { id: 'dominion',  name: 'Dominion',  color: '#6ec6ff', blurb: 'Control. Nothing moves at its own pace.' },
    kinesis:   { id: 'kinesis',   name: 'Kinesis',   color: '#9dff5c', blurb: 'Mobility. Never be where the bullet is.' }
  };

  /* base values the compiler starts from.
     'add' effects are summed onto the base, then 'mult' effects multiply. */
  const STAT_BASE = {
    damage: 1,          // multiplier
    fireRate: 1,        // multiplier
    moveSpeed: 1,       // multiplier
    dashCooldown: 1,    // multiplier (lower is better)
    maxHp: 0,           // flat
    armor: 0,           // flat 0..1
    pierce: 0,          // flat
    projectiles: 0,     // flat, extra shots per trigger pull
    critChance: 0,      // flat 0..1
    critDamage: 0,      // flat, added to the crit multiplier
    slowPower: 0,       // flat 0..1
    statusDuration: 1,  // multiplier
    auraRadius: 1,      // multiplier
    chainCount: 0,      // flat
    dashCharges: 0      // flat
  };

  const NODES = [
    /* ---------------- row 0: root ---------------- */
    { id: 'core', name: 'Combat Uplink', desc: 'Boot the frame. Everything downstream hangs off this.',
      tier: 'white', archetype: null, col: 4, row: 0, parents: [],
      effect: { stat: 'damage', op: 'mult', value: 1.04 } },

    /* ---------------- row 1: the three lanes split ---------------- */
    { id: 'ons_1', name: 'Hair Trigger', desc: 'Lighter sear. The gun answers sooner.',
      tier: 'white', archetype: 'onslaught', col: 1, row: 1, parents: ['core'],
      effect: { stat: 'fireRate', op: 'mult', value: 1.06 } },
    { id: 'dom_1', name: 'Cryo Coating', desc: 'Rounds carry a freezing film.',
      tier: 'white', archetype: 'dominion', col: 4, row: 1, parents: ['core'],
      effect: { stat: 'slowPower', op: 'add', value: 0.12 } },
    { id: 'kin_1', name: 'Light Frame', desc: 'Strip the plating you were never going to use.',
      tier: 'white', archetype: 'kinesis', col: 7, row: 1, parents: ['core'],
      effect: { stat: 'moveSpeed', op: 'mult', value: 1.05 } },

    /* ---------------- row 2 ---------------- */
    { id: 'ons_2', name: 'Heavy Rounds', desc: 'More mass per round.',
      tier: 'white', archetype: 'onslaught', col: 0, row: 2, parents: ['ons_1'],
      effect: { stat: 'damage', op: 'mult', value: 1.08 } },
    { id: 'ons_3', name: 'Match Grade', desc: 'Tighter tolerances find the weak points.',
      tier: 'white', archetype: 'onslaught', col: 2, row: 2, parents: ['ons_1'],
      effect: { stat: 'critChance', op: 'add', value: 0.04 } },
    { id: 'dom_2', name: 'Lingering Frost', desc: 'The chill outstays the impact.',
      tier: 'white', archetype: 'dominion', col: 3, row: 2, parents: ['dom_1'],
      effect: { stat: 'statusDuration', op: 'mult', value: 1.20 } },
    { id: 'dom_3', name: 'Broadcast Array', desc: 'Wider emitters, wider reach.',
      tier: 'white', archetype: 'dominion', col: 5, row: 2, parents: ['dom_1'],
      effect: { stat: 'auraRadius', op: 'mult', value: 1.15 } },
    { id: 'kin_2', name: 'Kinetic Boots', desc: 'Recoil from the last dash charges the next.',
      tier: 'white', archetype: 'kinesis', col: 6, row: 2, parents: ['kin_1'],
      effect: { stat: 'dashCooldown', op: 'mult', value: 0.90 } },
    { id: 'kin_3', name: 'Evasion Plating', desc: 'Angled panels, less drag.',
      tier: 'white', archetype: 'kinesis', col: 8, row: 2, parents: ['kin_1'],
      effect: { stat: 'moveSpeed', op: 'mult', value: 1.05 } },

    /* ---------------- row 3: first yellows, first archetype gates ---------------- */
    { id: 'ons_y1', name: 'Overpressure', desc: 'Overcharged loads. Hits far harder, cycles slower.',
      tier: 'yellow', archetype: 'onslaught', col: 1, row: 3, parents: ['ons_2', 'ons_3'],
      reqs: { archetypeMin: { name: 'onslaught', count: 2 } },
      effects: [ { stat: 'damage', op: 'mult', value: 1.20 }, { stat: 'fireRate', op: 'mult', value: 0.92 } ] },
    { id: 'dom_y1', name: 'Static Web', desc: 'Impacts arc to a second target.',
      tier: 'yellow', archetype: 'dominion', col: 4, row: 3, parents: ['dom_2', 'dom_3'],
      reqs: { archetypeMin: { name: 'dominion', count: 2 } },
      effects: [ { stat: 'chainCount', op: 'add', value: 1 }, { flag: 'staticWeb' } ] },
    { id: 'kin_y1', name: 'Phase Dash', desc: 'The dash phases you out: a second charge, and you cannot be touched mid-blink.',
      tier: 'yellow', archetype: 'kinesis', col: 7, row: 3, parents: ['kin_2', 'kin_3'],
      reqs: { archetypeMin: { name: 'kinesis', count: 2 } },
      effects: [ { stat: 'dashCharges', op: 'add', value: 1 }, { flag: 'phaseDash' } ] },

    /* ---------------- row 4 ---------------- */
    { id: 'ons_4', name: 'Barrel Extension', desc: 'Longer barrel, more of the charge spent on the target.',
      tier: 'white', archetype: 'onslaught', col: 0, row: 4, parents: ['ons_y1'],
      effect: { stat: 'damage', op: 'mult', value: 1.07 } },
    { id: 'ons_5', name: 'Rapid Cycle', desc: 'Shorter reset between shots.',
      tier: 'white', archetype: 'onslaught', col: 2, row: 4, parents: ['ons_y1'],
      effect: { stat: 'fireRate', op: 'mult', value: 1.07 } },
    { id: 'dom_4', name: 'Deep Chill', desc: 'Colder rounds bite deeper.',
      tier: 'white', archetype: 'dominion', col: 3, row: 4, parents: ['dom_y1'],
      effect: { stat: 'slowPower', op: 'add', value: 0.14 } },
    { id: 'dom_5', name: 'Capacitor Bank', desc: 'Hold more charge, project it further.',
      tier: 'white', archetype: 'dominion', col: 5, row: 4, parents: ['dom_y1'],
      effect: { stat: 'auraRadius', op: 'mult', value: 1.12 } },
    { id: 'kin_4', name: 'Momentum Cells', desc: 'Speed feeds speed.',
      tier: 'white', archetype: 'kinesis', col: 6, row: 4, parents: ['kin_y1'],
      effect: { stat: 'moveSpeed', op: 'mult', value: 1.06 } },
    { id: 'kin_5', name: 'Slipstream', desc: 'The frame recovers from a blink faster.',
      tier: 'white', archetype: 'kinesis', col: 8, row: 4, parents: ['kin_y1'],
      effect: { stat: 'dashCooldown', op: 'mult', value: 0.90 } },

    /* ---------------- row 5: first reds ---------------- */
    { id: 'ons_r1', name: 'Twin-Linked Barrels', desc: 'Your weapon fires an extra projectile on every trigger pull, and every round hits softer for it. A volume build.',
      tier: 'red', archetype: 'onslaught', col: 0, row: 5, parents: ['ons_4', 'ons_5'],
      blocks: ['ons_r2'],
      reqs: { archetypeMin: { name: 'onslaught', count: 4 }, pointsSpentMin: 8 },
      effects: [ { stat: 'projectiles', op: 'add', value: 1 }, { stat: 'damage', op: 'mult', value: 0.78 }, { flag: 'twinLinked' } ] },
    { id: 'ons_r2', name: 'Charged Chamber', desc: 'The weapon winds up instead of spraying: far slower, brutal per shot, and rounds punch through. A precision build.',
      tier: 'red', archetype: 'onslaught', col: 2, row: 5, parents: ['ons_4', 'ons_5'],
      blocks: ['ons_r1'],
      reqs: { archetypeMin: { name: 'onslaught', count: 4 }, pointsSpentMin: 8 },
      effects: [ { stat: 'fireRate', op: 'mult', value: 0.55 }, { stat: 'damage', op: 'mult', value: 2.6 }, { stat: 'pierce', op: 'add', value: 2 }, { flag: 'chargedChamber' } ] },
    { id: 'dom_r1', name: 'Gravity Well', desc: 'Every explosion collapses into a well that drags and slows whatever survives it.',
      tier: 'red', archetype: 'dominion', col: 4, row: 5, parents: ['dom_4', 'dom_5'],
      reqs: { archetypeMin: { name: 'dominion', count: 4 }, pointsSpentMin: 8 },
      effects: [ { flag: 'gravityWell' }, { stat: 'slowPower', op: 'add', value: 0.10 } ] },
    { id: 'kin_r1', name: 'Blink Protocol', desc: 'The dash stops being movement. You cross the gap instantly and everything on the line takes the trip badly.',
      tier: 'red', archetype: 'kinesis', col: 7, row: 5, parents: ['kin_4', 'kin_5'],
      reqs: { archetypeMin: { name: 'kinesis', count: 4 }, pointsSpentMin: 8 },
      effects: [ { flag: 'blinkProtocol' }, { stat: 'dashCooldown', op: 'mult', value: 0.85 } ] },

    /* ---------------- row 6: neutral hub, reachable from any lane ---------------- */
    { id: 'hub', name: 'Power Core', desc: 'Whatever you became, it needs more power to run.',
      tier: 'white', archetype: null, col: 4, row: 6, parents: ['ons_r1', 'ons_r2', 'dom_r1', 'kin_r1'],
      effects: [ { stat: 'maxHp', op: 'add', value: 25 }, { stat: 'armor', op: 'add', value: 0.04 } ] },

    /* ---------------- row 7: second yellows ---------------- */
    { id: 'ons_y2', name: 'Executioner', desc: 'Anything under 12% health simply stops.',
      tier: 'yellow', archetype: 'onslaught', col: 1, row: 7, parents: ['hub'],
      reqs: { archetypeMin: { name: 'onslaught', count: 5 } },
      effect: { flag: 'executioner' } },
    { id: 'dom_y2', name: 'Cryo Nova', desc: 'Dashing detonates a freezing nova around you.',
      tier: 'yellow', archetype: 'dominion', col: 4, row: 7, parents: ['hub'],
      reqs: { archetypeMin: { name: 'dominion', count: 5 } },
      effect: { flag: 'cryoNova' } },
    { id: 'kin_y2', name: 'Bladestorm', desc: 'Two blades ride your orbit and cut what closes in.',
      tier: 'yellow', archetype: 'kinesis', col: 7, row: 7, parents: ['hub'],
      reqs: { archetypeMin: { name: 'kinesis', count: 5 } },
      effect: { flag: 'bladestorm' } },

    /* ---------------- row 8 ---------------- */
    { id: 'ons_6', name: 'Hollow Points', desc: 'Critical hits open a wider wound.',
      tier: 'white', archetype: 'onslaught', col: 1, row: 8, parents: ['ons_y2'],
      effect: { stat: 'critDamage', op: 'add', value: 0.35 } },
    { id: 'dom_6', name: 'Subzero', desc: 'The field runs colder still.',
      tier: 'white', archetype: 'dominion', col: 4, row: 8, parents: ['dom_y2'],
      effect: { stat: 'slowPower', op: 'add', value: 0.14 } },
    { id: 'kin_6', name: 'Featherweight', desc: 'Nothing left to cut but weight.',
      tier: 'white', archetype: 'kinesis', col: 7, row: 8, parents: ['kin_y2'],
      effect: { stat: 'moveSpeed', op: 'mult', value: 1.06 } },

    /* ---------------- row 9: late reds / late yellow ---------------- */
    { id: 'ons_y3', name: 'Frenzy', desc: 'Every kill spins the weapon up for two seconds.',
      tier: 'yellow', archetype: 'onslaught', col: 1, row: 9, parents: ['ons_6'],
      reqs: { archetypeMin: { name: 'onslaught', count: 7 } },
      effect: { flag: 'frenzy' } },
    { id: 'dom_r2', name: 'Stasis Lock', desc: 'A slowed enemy under 20% health does not die. It shatters, and the shards chill its neighbours.',
      tier: 'red', archetype: 'dominion', col: 4, row: 9, parents: ['dom_6'],
      reqs: { archetypeMin: { name: 'dominion', count: 7 }, pointsSpentMin: 16 },
      effect: { flag: 'stasisLock' } },
    { id: 'kin_r2', name: 'Ricochet Rounds', desc: 'Shots stop dying on walls. They come off the geometry twice and keep hunting.',
      tier: 'red', archetype: 'kinesis', col: 7, row: 9, parents: ['kin_6'],
      reqs: { archetypeMin: { name: 'kinesis', count: 7 }, pointsSpentMin: 16 },
      effect: { flag: 'ricochet' } },

    /* ---------------- row 10: third yellows ---------------- */
    { id: 'ons_y4', name: 'Hammer Blow', desc: 'Shots that land on a full-health target hit harder.',
      tier: 'yellow', archetype: 'onslaught', col: 1, row: 10, parents: ['ons_y3'],
      reqs: { archetypeMin: { name: 'onslaught', count: 8 } },
      effect: { stat: 'damage', op: 'mult', value: 1.15 } },
    { id: 'dom_y3', name: 'Conductor', desc: 'Every arc leaves its target chilled.',
      tier: 'yellow', archetype: 'dominion', col: 4, row: 10, parents: ['dom_r2'],
      reqs: { archetypeMin: { name: 'dominion', count: 8 } },
      effects: [ { flag: 'conductor' }, { stat: 'chainCount', op: 'add', value: 1 } ] },
    { id: 'kin_y3', name: 'Afterimage', desc: 'Your blink leaves something behind that still hurts.',
      tier: 'yellow', archetype: 'kinesis', col: 7, row: 10, parents: ['kin_r2'],
      reqs: { archetypeMin: { name: 'kinesis', count: 8 } },
      effect: { flag: 'afterimage' } },

    /* ---------------- row 11: capstones, mutually exclusive ---------------- */
    { id: 'cap_ons', name: 'ANNIHILATION', desc: 'Nothing survives contact. Enormous damage, crits tear through every body in the line, and the armour you stripped is not coming back.',
      tier: 'red', archetype: 'onslaught', col: 1, row: 11, parents: ['ons_y4'],
      blocks: ['cap_dom', 'cap_kin'],
      reqs: { archetypeMin: { name: 'onslaught', count: 8 }, pointsSpentMin: 20 },
      effects: [ { stat: 'damage', op: 'mult', value: 1.6 }, { stat: 'maxHp', op: 'add', value: -25 }, { flag: 'annihilation' } ] },
    { id: 'cap_dom', name: 'ABSOLUTE ZERO', desc: 'The arena freezes around you. A permanent chill field, slows deepened past anything else in the tree, and shatters that spread.',
      tier: 'red', archetype: 'dominion', col: 4, row: 11, parents: ['dom_y3'],
      blocks: ['cap_ons', 'cap_kin'],
      reqs: { archetypeMin: { name: 'dominion', count: 8 }, pointsSpentMin: 20 },
      effects: [ { stat: 'slowPower', op: 'add', value: 0.25 }, { stat: 'auraRadius', op: 'mult', value: 1.5 }, { flag: 'absoluteZero' } ] },
    { id: 'cap_kin', name: 'PERPETUAL MOTION', desc: 'Three blink charges that refill as fast as you can spend them, and your damage rides your speed.',
      tier: 'red', archetype: 'kinesis', col: 7, row: 11, parents: ['kin_y3'],
      blocks: ['cap_ons', 'cap_dom'],
      reqs: { archetypeMin: { name: 'kinesis', count: 8 }, pointsSpentMin: 20 },
      effects: [ { stat: 'dashCharges', op: 'add', value: 2 }, { stat: 'dashCooldown', op: 'mult', value: 0.5 }, { flag: 'perpetualMotion' } ] }
  ];

  const COLS = 9;

  return { NODES, ARCHETYPES, STAT_BASE, TIER_COST, TIER_LABEL, COLS };
});
