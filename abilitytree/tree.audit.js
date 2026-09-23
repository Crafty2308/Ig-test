#!/usr/bin/env node
/* ============================================================
   ability tree - CONFLICT AUDIT
   Checks every node in every tree against what that class can
   actually do, and checks every description against its effects.
       node tree.audit.js
   ============================================================ */
const T = require('./tree.logic.js');

/* What each class's weapon actually is. Kept here, next to the rules that
   use it, so a weapon change forces a look at this table. */
const WEAPON = {
  vanguard: { projectile: true, aegis: true, canStandStill: true },
  cinder:   { projectile: true, groundFire: true, canStandStill: true },
  halcyon:  { beam: true, canStandStill: true },
  arc:      { projectile: true, dualMode: true, canStandStill: true },
  vex:      { projectile: true, chargeUp: true, autoAim: true, canStandStill: true },
  nyx:      { projectile: true, autoMove: true, canStandStill: false },
  cog:      { projectile: true, drones: true, canStandStill: true },
  boom:     { projectile: true, explosive: true, sticky: true, canStandStill: true },
  mourn:    { projectile: true, returning: true, canStandStill: true },
  iris:     { projectile: true, bouncy: true, prisms: true, canStandStill: true },
  vessel:   { summon: true, canStandStill: true },
  echo:     { projectile: true, echo: true, canStandStill: true },
  void:     { projectile: true, wells: true, canStandStill: true },
  harrow:   { tether: true, canStandStill: true }
};

/* stat -> what the class must have for the stat to do anything */
const STAT_NEEDS = {
  beamPower: 'beam', beamRamp: 'beam', beamRange: 'beam',
  meterGain: 'dualMode', dischargePower: 'dualMode', dischargeChain: 'dualMode',
  chargePower: 'chargeUp', chargeRate: 'chargeUp',
  focusPower: 'drones', focusTime: 'drones',
  minionCount: 'summon', minionDamage: 'summon', minionHealth: 'summon',
  minionSpeed: 'summon', minionRate: 'summon', essenceRegen: 'summon',
  summonCost: 'summon', essenceOnKill: 'summon', consumePower: 'summon',
  consumeHeal: 'summon', consumeRefund: 'summon', rallyPower: 'summon', rallyRange: 'summon',
  bounces: 'projectile', homingStrength: 'projectile',
  fireDamage: 'groundFire', fireDuration: 'groundFire', fireSize: 'groundFire',
  stickyCount: 'sticky', prismCount: 'prisms', prismPower: 'prisms',
  aegisPower: 'aegis', aegisReflect: 'aegis', catchHeal: 'returning',
  echoPower: 'echo', echoCount: 'echo', echoSpeed: 'echo',
  wellPower: 'wells', wellRadius: 'wells', wellPull: 'wells',
  wellDuration: 'wells', wellCount: 'wells', wellCrowd: 'wells',
  barbDamage: 'tether', lineDamage: 'tether', yankDamage: 'tether',
  harpoonHit: 'tether', reelSpeed: 'tether', tetherRange: 'tether'
};

/* flag -> what the class must have */
const FLAG_NEEDS = {
  steadyAim: 'canStandStill',
  bounceSplit: 'projectile', amplify: 'projectile', volatile: 'projectile',
  megaShell: 'projectile', noFalloff: 'shootsThings', critPierce: 'shootsThings',
  droneBoom: 'drones', droneShield: 'drones',
  soulLink: 'summon', thrallBurst: 'summon', phylactery: 'summon',
  aegisBurst: 'aegis', chainDetonate: 'sticky', catchReset: 'returning',
  echoSwap: 'echo', echoBlast: 'echo', trueEcho: 'echo',
  wellCrush: 'wells', collapsar: 'wells', eventHorizon: 'wells',
  harpoonRip: 'tether', barbedChain: 'tether', deadWeight: 'tether'
};

/* description <-> effect consistency. Each rule pulls a number out of the text
   and says what the matching effect must be. */
const TEXT_RULES = [
  /* A number in the text must match an effect. Some phrasings come from flags
     rather than stats - those carry a `via` list and are satisfied by the flag. */
  { re: /\+(\d+)% damage\b/gi, stat: 'damage', op: 'mult',
    skip: /\+\d+% damage per 10%|\+\d+% damage for every 10%|split at \+\d+% damage/i, via: [] },
  /* prism splits are quoted as a total; the node carries the amount above the 25% base */
  { re: /split(?:s)? (?:at|deal) \+(\d+)%/gi, stat: 'prismPower', op: 'addPctOver25', via: [] },
  { re: /\+(\d+)% damage per 10%/gi, stat: 'berserk', op: 'addPctTenth', via: [] },
  { re: /\+(\d+)% fire rate\b/gi, stat: 'fireRate', op: 'mult', via: ['frenzy'] },
  { re: /\+(\d+)% move speed\b/gi, stat: 'moveSpeed', op: 'mult', via: ['adrenaline', 'desperate'] },
  { re: /\+(\d+)% critical hit chance\b/gi, stat: 'critChance', op: 'addPct', via: [] },
  { re: /(\d+)% damage reduction\b/gi, stat: 'armor', op: 'addPct', via: ['fortress'] },
  { re: /\+(\d+) max HP\b/gi, stat: 'maxHp', op: 'add', via: [] },
  { re: /\+(\d+) shield capacity\b/gi, stat: 'shield', op: 'add', via: [] },
  { re: /\+(\d+) orbit blades?\b/gi, stat: 'orbitCount', op: 'add', via: ['bladestorm'] },
  { re: /\+(\d+) dash charges?\b/gi, stat: 'dashCharges', op: 'add', via: [] },
  { re: /\+(\d+) projectiles?\b/gi, stat: 'projectiles', op: 'add', via: [] },
  { re: /\+(\d+) thralls?\b/gi, stat: 'minionCount', op: 'add', via: [] },
  { re: /\+(\d+) drones?\b/gi, stat: 'droneCount', op: 'add', via: [] },
  { re: /pass through (\d+) more enem/gi, stat: 'pierce', op: 'add', via: [] },
  { re: /kill releases an arcs? to (\d+) more enem/gi, stat: 'killChainCount', op: 'add', via: [] },
  { re: /arcs? to (\d+) more enem/gi, stat: 'chainCount', op: 'add', alt: 'dischargeChain', via: [],
    skip: /kill releases an arc/i },
  { re: /explosions are (\d+)% larger/gi, stat: 'explosionSize', op: 'mult', via: [] },
  { re: /explosions deal (\d+)% more damage/gi, stat: 'explosionDamage', op: 'mult', via: [] }
];

const findings = [];
const note = (sev, charId, nodeId, msg) => findings.push({ sev, charId, nodeId, msg });

for (const charId of T.CHAR_IDS) {
  const idx = T.INDEX[charId];
  const w = WEAPON[charId];
  if (!w) { note('ERROR', charId, '-', 'no weapon profile in the audit table'); continue; }
  w.shootsThings = !!(w.projectile || w.beam);

  const laneFlags = {};      // what each lane already grants, for stacking checks
  for (const n of idx.nodes) {
    const effs = n.effects || (n.effect ? [n.effect] : []);

    for (const e of effs) {
      /* 1. does this stat do anything for this class */
      if (e.stat && STAT_NEEDS[e.stat] && !w[STAT_NEEDS[e.stat]]) {
        note('DEAD', charId, n.id, '"' + n.name + '" grants ' + e.stat + ', which needs a ' +
             STAT_NEEDS[e.stat] + ' weapon. This class has none.');
      }
      /* 2. does this flag do anything */
      if (e.flag && FLAG_NEEDS[e.flag] && !w[FLAG_NEEDS[e.flag]]) {
        note('DEAD', charId, n.id, '"' + n.name + '" sets ' + e.flag + ', which needs ' +
             FLAG_NEEDS[e.flag] + '. This class has none.');
      }
      /* 3. a binary flag taken twice in one tree with nothing else attached */
      if (e.flag && effs.length === 1) {
        const key = e.flag;
        if (laneFlags[key]) {
          note('DEAD', charId, n.id, '"' + n.name + '" re-sets flag ' + key + ' already set by "' +
               laneFlags[key] + '". A flag is a Set, so the second one does nothing.');
        } else laneFlags[key] = n.name;
      }
    }

    /* 4. does the description match the effects */
    const flags = new Set(effs.filter(e => e.flag).map(e => e.flag));
    for (const rule of TEXT_RULES) {
      if (rule.skip && rule.skip.test(n.desc)) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(n.desc)) !== null) {
        const want = Number(m[1]);
        if (rule.via && rule.via.some(f => flags.has(f))) continue;   // the flag says it
        const hits = effs.filter(e => e.stat === rule.stat || (rule.alt && e.stat === rule.alt));
        if (!hits.length) {
          note('TEXT', charId, n.id, '"' + n.name + '" says "' + m[0].trim() + '" but has no ' +
               rule.stat + (rule.alt ? '/' + rule.alt : '') + ' effect.');
          continue;
        }
        const values = hits.map(hit => {
          if (rule.op === 'mult') return Math.round((hit.value - 1) * 100);
          if (rule.op === 'addPct') return Math.round(hit.value * 100);
          if (rule.op === 'addPctTenth') return Math.round(hit.value * 100);
          if (rule.op === 'addPctOver25') return Math.round(hit.value * 100) + 25;
          return hit.value;
        });
        if (!values.some(v => Math.abs(v - want) <= 0.51)) {
          note('TEXT', charId, n.id, '"' + n.name + '" says "' + m[0].trim() + '" but the effect' +
               (values.length > 1 ? 's are ' : ' is ') + values.join(' / ') + '.');
        }
      }
    }

    /* 5. a convergence must not require an archetype it does not join */
    if (n.dual && n.reqs && n.reqs.archetypeMins) {
      for (const min of n.reqs.archetypeMins) {
        if (n.dual.indexOf(min.name) === -1) {
          note('ERROR', charId, n.id, '"' + n.name + '" is gated on ' + min.name + ' but joins ' + n.dual.join(' + '));
        }
      }
    }
    /* 6. a lane node must be gated on its own archetype only */
    if (!n.dual && n.archetype && n.reqs && n.reqs.archetypeMins) {
      for (const min of n.reqs.archetypeMins) {
        if (min.name !== n.archetype) {
          note('ERROR', charId, n.id, '"' + n.name + '" sits in ' + n.archetype + ' but is gated on ' + min.name);
        }
      }
    }
  }
}

const bySev = { ERROR: [], DEAD: [], TEXT: [] };
for (const f of findings) bySev[f.sev].push(f);
for (const sev of ['ERROR', 'DEAD', 'TEXT']) {
  if (!bySev[sev].length) continue;
  console.log('\n' + sev + ' (' + bySev[sev].length + ')');
  for (const f of bySev[sev]) console.log('  [' + f.charId + '] ' + f.msg);
}
console.log('\naudit: ' + findings.length + ' findings across ' + T.CHAR_IDS.length + ' trees');
if (typeof process !== 'undefined' && process.exit) process.exit(findings.length ? 1 : 0);
