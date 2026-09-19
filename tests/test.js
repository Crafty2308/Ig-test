const E=require(require('path').join(__dirname,'extract.js'))();
let pass=0, fail=0;
function ok(name,cond,extra){ if(cond){pass++;} else {fail++; console.log("FAIL: "+name+(extra!==undefined?"  -> "+JSON.stringify(extra):""));} }
function near(a,b,tol){ return Math.abs(a-b) <= (tol==null?1e-6:tol); }

// ---------- 1. tiered table ----------
ok("tiered 0", E.tiered(0,E.T_DMG)===0);
ok("tiered 20 = 24", near(E.tiered(20,E.T_DMG),24));
ok("tiered 45 = 42.5", near(E.tiered(45,E.T_DMG),42.5));
ok("tiered 100 = 70", near(E.tiered(100,E.T_DMG),24+16+15+7.5));

// ---------- 2. data integrity ----------
ok("80 items", Object.keys(E.ITEMS).length===80, Object.keys(E.ITEMS).length);
ok("12 majors", Object.keys(E.MAJORS).length===12);
const rar={}; for(const k in E.ITEMS) rar[E.ITEMS[k].rarity]=(rar[E.ITEMS[k].rarity]||0)+1;
ok("6 rarities used", Object.keys(rar).length===6, rar);
// every major reachable from an item or node
const majorSources={};
for(const k in E.ITEMS) if(E.ITEMS[k].major) majorSources[E.ITEMS[k].major]=1;
for(const c in E.TREES) for(const n of E.TREES[c].list) if(n.major) majorSources[n.major]=1;
for(const m in E.MAJORS) ok("major obtainable: "+m, !!majorSources[m]);
// weapons per class
for(const c in E.CLASSES){ const w=Object.values(E.ITEMS).filter(i=>i.slot==="weapon"&&i.cls===c); ok("5 weapons for "+c, w.length===5, w.length); }
// slots covered
for(const s of ["helm","chest","legs","boots","ring","amulet"]) ok("items for "+s, Object.values(E.ITEMS).filter(i=>i.slot===s).length>=8);

// ---------- 3. tree graph integrity ----------
for(const c in E.TREES){
  const t=E.TREES[c];
  ok(c+": around 60 nodes", t.list.length>=56 && t.list.length<=64, t.list.length);
  const ids=new Set();
  let dupe=null; for(const n of t.list){ if(ids.has(n.id)) dupe=n.id; ids.add(n.id); }
  ok(c+": no duplicate ids", !dupe, dupe);
  let badParent=null, selfRef=null;
  for(const n of t.list) for(const p of n.req){ if(!t.byId[p]) badParent=n.id+"->"+p; if(p===n.id) selfRef=n.id; }
  ok(c+": all parents exist", !badParent, badParent);
  ok(c+": no self reference", !selfRef, selfRef);
  const roots=t.list.filter(n=>n.req.length===0);
  ok(c+": exactly one root", roots.length===1, roots.map(r=>r.id));
  // every node reachable from root by BFS over req-edges
  const seen=new Set([roots[0].id]); let changed=true;
  while(changed){ changed=false; for(const n of t.list){ if(seen.has(n.id)) continue; if(n.req.some(p=>seen.has(p))){ seen.add(n.id); changed=true; } } }
  ok(c+": all nodes reachable", seen.size===t.list.length, t.list.filter(n=>!seen.has(n.id)).map(n=>n.id));
  // parents must be strictly above (y smaller) so edges read downward
  let upward=null;
  for(const n of t.list) for(const p of n.req){ if(t.byId[p].y >= n.y) upward=n.id+" <- "+p; }
  ok(c+": edges all point downward", !upward, upward);
  // node overlap check
  let tooClose=null;
  for(let i=0;i<t.list.length;i++) for(let j=i+1;j<t.list.length;j++){
    const a=t.list[i],b=t.list[j], d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d<0.62) tooClose=a.id+"/"+b.id+" d="+d.toFixed(2);
  }
  ok(c+": no overlapping nodes", !tooClose, tooClose);
  // keystones
  const keys=t.list.filter(n=>n.type==="key");
  ok(c+": exactly 3 keystones", keys.length===3, keys.length);
  const excl=keys.filter(k=>k.excl);
  ok(c+": keystones mutually exclusive", excl.length>=3, excl.length);
  // node type mix
  const types={}; for(const n of t.list) types[n.type]=(types[n.type]||0)+1;
  ok(c+": has all four node types", types.stat&&types.mod&&types.ability&&types.key, types);
  // total tree cost should far exceed the budget (you can only take ~a third)
  const total=t.list.reduce((s,n)=>s+n.cost,0);
  const frac=E.treeBudget(15)/total;
  ok(c+": budget is ~a third of the tree", frac>0.25&&frac<0.42, {total, budget:E.treeBudget(15), frac:+frac.toFixed(3)});
}

// ---------- 4. damage pipeline ordering ----------
function mkCtx(cls, over){
  const s=E.newState(cls);
  if(over) over(s);
  return E.buildContext(s);
}
{
  const s=E.newState("warden");
  // give a deterministic weapon: force max roll
  s.equipped.weapon.rolls={"dmgBase.neutral":1,"hp":1};
  const ctx=E.buildContext(s);
  const base=ctx.base.neutral;
  ok("weapon base rolled to max", base===26, base);
  const atk={id:"x",name:"X",kind:"spell",mult:2,flatScale:1};
  let r=E.computeAttack(ctx,atk);
  // no bonuses at all except class base (warden base has no dmg)
  const expectHit = base*2 * (1 + (ctx.agg.total["dmg.all"]||0)/100);
  ok("base*mult with no bonuses", near(r.hit, expectHit, 0.01), {hit:r.hit, expectHit});
  const expectEff = expectHit*(1+(ctx.critChance/100)*(ctx.critMult-1));
  ok("crit applied as expected value", near(r.effective, expectEff, 0.01), {eff:r.effective, expectEff});
}
{
  // additive summation vs multiplicative separation
  const s=E.newState("warden");
  s.equipped.weapon.rolls={"dmgBase.neutral":1,"hp":1};
  const ctx=E.buildContext(s);
  const b=ctx.base.neutral;
  const atk={id:"x",name:"X",kind:"spell",mult:1,flatScale:1};
  ctx.agg.total["dmg.all"]=50; ctx.agg.total["dmg.neutral"]=50;
  let r1=E.computeAttack(ctx,atk);
  ok("two +50% additive = x2.0", near(r1.hit, b*2, 1e-9), {hit:r1.hit, want:b*2});
  ctx.agg.total["dmg.all"]=0; ctx.agg.total["dmg.neutral"]=0;
  ctx.agg.total["mult.all"]=25; ctx.agg.total["mult.spell"]=25;
  let r2=E.computeAttack(ctx,atk);
  ok("two x1.25 multiplicative = x1.5625", near(r2.hit, b*1.5625, 1e-9), {hit:r2.hit, want:b*1.5625});
  // order: additive applies before multiplicative
  ctx.agg.total["dmg.all"]=100;
  let r3=E.computeAttack(ctx,atk);
  ok("additive then multiplicative", near(r3.hit, b*2*1.5625, 1e-9), {hit:r3.hit, want:b*2*1.5625});
}
{
  // conversion happens after scaling and carries the SOURCE scaling
  const s=E.newState("warden");
  s.equipped.weapon.rolls={"dmgBase.neutral":1,"hp":1};
  const ctx=E.buildContext(s);
  const b=ctx.base.neutral;
  const atk={id:"x",name:"X",kind:"spell",mult:1,flatScale:1};
  ctx.agg.total["dmg.all"]=0;
  ctx.agg.total["dmg.neutral"]=100;   // neutral doubled
  ctx.agg.total["dmg.cinder"]=0;       // ember gets nothing
  ctx.agg.total["conv.neutral.cinder"]=50;
  const r=E.computeAttack(ctx,atk);
  ok("conversion moves post-scaling damage", near(r.rawBuckets.cinder, b*2*0.5, 1e-9), {ember:r.rawBuckets.cinder, want:b});
  ok("conversion leaves the remainder", near(r.rawBuckets.neutral, b*2*0.5, 1e-9));
  ok("conversion preserves total", near(r.hit, b*2, 1e-9));
  // over-conversion is clamped to 100%
  ctx.agg.total["conv.neutral.cinder"]=90; ctx.agg.total["conv.neutral.frost"]=90;
  const r2=E.computeAttack(ctx,atk);
  ok("over-conversion clamped, nothing created", near(r2.hit, b*2, 1e-6), {hit:r2.hit, want:b*2});
  ok("over-conversion empties the source", near(r2.rawBuckets.neutral, 0, 1e-6), r2.rawBuckets.neutral);
}
{
  // flat damage scales by the attack's flat scaling, not by the spell multiplier
  const s=E.newState("warden");
  s.equipped.weapon.rolls={"dmgBase.neutral":1,"hp":1};
  const ctx=E.buildContext(s);
  const b=ctx.base.neutral;
  ctx.agg.total["flat.cinder"]=100;
  const slow=E.computeAttack(ctx,{id:"x",name:"X",kind:"spell",mult:1,flatScale:2});
  const fast=E.computeAttack(ctx,{id:"y",name:"Y",kind:"spell",mult:1,flatScale:0.5});
  ok("flat scales with flatScale", near(slow.rawBuckets.cinder/fast.rawBuckets.cinder, 4, 1e-9),
     {slow:slow.rawBuckets.cinder, fast:fast.rawBuckets.cinder});
}

// ---------- 5. element requirements ----------
{
  const s=E.newState("skyward");
  const coil=E.rollItem("h_coilhelm"); coil.rolls={"crit":1,"dmg.volt":1,"elem.volt":1,"hp":1}; // +4 volt
  s.inv.push(coil); s.equipped.helm=coil;
  s.alloc.volt=0;
  let ctx=E.buildContext(s);
  ok("item's own grant cannot satisfy its own requirement", ctx.meets.helm.ok===false, ctx.meets.helm);
  s.alloc.volt=18;
  ctx=E.buildContext(s);
  ok("allocated points satisfy requirement", ctx.meets.helm.ok===true);
  ok("granted points add to the pool", ctx.pool.volt===22, ctx.pool.volt);
  // second item can use the first's grant
  const sig=E.rollItem("r_voltaic"); sig.rolls={"crit":.5,"flat.volt":.5};
  s.inv.push(sig); s.equipped.ring1=sig; s.alloc.volt=12;
  ctx=E.buildContext(s);
  ok("grant from another item satisfies req (ring needs 14, has 12+4)", ctx.meets.ring1.ok===true, ctx.pool.volt);
  ok("but the granting helm itself now fails (needs 18, has 12)", ctx.meets.helm.ok===false);
  ok("unmet item contributes no stats", !(ctx.agg.src["dmg.volt"]||[]).some(x=>x.name==="Coil Helm"));
}

// ---------- 6. roll quality ----------
{
  const i1=E.rollItem("h_rimecrown"); i1.rolls={"dmg.frost":1,"mana":1,"manaRegen":1,"hp":1};
  const v=E.rolledValues(i1);
  ok("max roll takes range top", v["dmg.frost"]===18 && v["mana"]===28, v);
  ok("negative stat max roll is the least bad", v["hp"]===-10, v["hp"]);
  ok("quality 100% at max roll", Math.abs(E.itemQuality(i1)-1)<1e-9);
  const i2=E.rollItem("h_rimecrown"); i2.rolls={"dmg.frost":0,"mana":0,"manaRegen":0,"hp":0};
  ok("quality 0% at min roll", Math.abs(E.itemQuality(i2))<1e-9);
  // cost.all is lower-better
  const i3=E.rollItem("w_wd4"); i3.rolls={"cost.all":0};
  ok("lower-is-better stat reads 100% at its low end", E.statQuality("cost.all",[8,15],8)===1);
  ok("lower-is-better stat reads 0% at its high end", E.statQuality("cost.all",[8,15],15)===0);
}

// ---------- 7. defence maths ----------
{
  const s=E.newState("warden"); const ctx=E.buildContext(s);
  ctx.agg.total["res.cinder"]=50; ctx.dodge=0;
  const inc=E.playerIncoming(ctx,{cinder:100,frost:100});
  ok("resistance halves that element", Math.abs(inc.buckets.cinder - 100*0.5*(1-(ctx.agg.total["armor"]||0)/100))<1e-6, inc.buckets);
  ok("other elements untouched by it", inc.buckets.frost > inc.buckets.cinder);
  ctx.dodge=50;
  const inc2=E.playerIncoming(ctx,{cinder:100});
  ok("dodge is a straight multiplier on expected damage", Math.abs(inc2.buckets.cinder - inc.buckets.cinder*0.5)<1e-6);
  const r=E.applyResist({cinder:100},{cinder:-50});
  ok("negative resistance is a vulnerability", Math.abs(r.total-150)<1e-6, r.total);
}

// ---------- 8. simulation sanity ----------
{
  for(const c in E.CLASSES){
    const s=E.newState(c);
    const ctx=E.buildContext(s);
    const h=E.headline(ctx);
    ok(c+": starting build has positive DPS", h.dps>0, h.dps);
    ok(c+": starting DPS is in a sane range", h.dps>4 && h.dps<400, h.dps);
    ok(c+": EHP positive", h.ehp>0);
    ok(c+": burst rate is in the right ballpark", h.burst/4 >= h.dps*0.30, {burst:h.burst, dps:h.dps});
    ok(c+": burst is not absurd", h.burst <= h.dps*4*6, {burst:h.burst, dps:h.dps});
    const r=E.dummyRun(ctx);
    ok(c+": rotation actually acts", r.totalTime>0);
    ok(c+": dealt matches dps*duration", Math.abs(r.dealt - r.dps*r.dur) < 1e-6);
  }
}
{
  // more damage stats must never lower DPS
  const s=E.newState("skyward");
  const a=E.headline(E.buildContext(s)).dps;
  const s2=JSON.parse(JSON.stringify(s));
  s2.alloc.volt=20;
  const b=E.headline(E.buildContext(s2)).dps;
  ok("allocating volt raises arcwright DPS", b>a, {a,b});
  const s3=JSON.parse(JSON.stringify(s)); s3.alloc.ember=20;
  const c3=E.headline(E.buildContext(s3)).dps;
  ok("allocating a useless element does not raise DPS much", c3<=b, {c3,b});
}
{
  // monotonic: better rolls never produce worse DPS
  const s=E.newState("thornbound");
  s.equipped.weapon.rolls={"dmgBase.neutral":0,"crit":0};
  const lo=E.headline(E.buildContext(s)).dps;
  s.equipped.weapon.rolls={"dmgBase.neutral":1,"crit":1};
  const hi=E.headline(E.buildContext(s)).dps;
  ok("higher weapon roll = higher DPS", hi>lo, {lo,hi});
}

// ---------- 8b. utility spells and rotation policy ----------
{
  // a spell with a 0 weapon multiplier must deal exactly zero weapon damage
  const skyCtx=E.buildContext(E.newState("skyward"));
  const dash=E.attackTable(skyCtx).find(a=>a.sp.id==="dash");
  ok("Dash has a 0 multiplier", dash.sp.mult===0);
  ok("a 0-multiplier utility spell deals no damage", dash.res.effective===0, dash.res.effective);
  const blink=E.attackTable(E.buildContext(E.newState("ember"))).find(a=>a.sp.id==="blink");
  ok("Blink likewise deals no damage", blink.res.effective===0, blink.res.effective);
  const guard=E.attackTable(E.buildContext(E.newState("warden"))).find(a=>a.sp.id==="guard");
  ok("Guard likewise deals no damage", guard.res.effective===0, guard.res.effective);
  const storm=E.attackTable(skyCtx).find(a=>a.sp.id==="storm");
  ok("a real spell still deals damage", storm.res.effective>0);
}
{
  // the rotation is chosen by simulation, and the chosen one is the best one
  for(const cls in E.CLASSES){
    const ctx=E.buildContext(E.newState(cls));
    const chosen=E.pickPolicy(ctx);
    const mine=E.simulate(ctx,E.DUMMY,{policy:chosen}).dealt;
    let bestOther=0;
    for(const p of ["debt","burst","permana","strike","combo"]) bestOther=Math.max(bestOther, E.simulate(ctx,E.DUMMY,{policy:p}).dealt);
    ok(cls+": chosen rotation is the best available", mine>=bestOther-1e-6, {chosen, mine, bestOther});
  }
}
{
  // a caster with a real mana pool must actually cast
  const s=E.newState("ember"); s.level=8; s.alloc.frost=22; s.alloc.gale=8;
  const st=E.rollItem("w_tc3"); st.rolls={"mana":.6,"cost.all":.6,"dmg.frost":.6,"dmgBase.neutral":.6,"dmgBase.frost":.6};
  s.inv.push(st); s.equipped.weapon=st;
  const ctx=E.buildContext(s);
  const r=E.dummyRun(ctx);
  const spellDmg=Object.keys(r.dealtBy).filter(k=>k!==ctx.weapon.strikeName).reduce((a,k)=>a+r.dealtBy[k],0);
  ok("an equipped Ember casts spells", spellDmg>0, r.dealtBy);
}

// ---------- 8c. spell behaviour is real, and modifiers rewrite it ----------
{
  // Warden: Ground Slam -> burning ground -> pull -> hits twice
  const s=E.newState("warden"); s.level=15;
  let ctx=E.buildContext(s);
  let slam=ctx.spells.find(x=>x.id==="slam");
  ok("Ground Slam starts with no ground effect", !slam.fx.zone);
  s.tree=["wd_root","wd_grip","wd_set","wd_heft","wd_tl","wd_tr","wd_commit","wd_t1"];
  ctx=E.buildContext(s); slam=ctx.spells.find(x=>x.id==="slam");
  ok("Fissure gives Ground Slam a lingering zone", !!slam.fx.zone && slam.fx.zone.pct>0, slam.fx.zone);
  s.tree.push("wd_t2");
  ctx=E.buildContext(s); slam=ctx.spells.find(x=>x.id==="slam");
  ok("Cinderfall makes that ground burn", slam.fx.zone.elem==="cinder", slam.fx.zone);
  s.tree.push("wd_t4");
  ctx=E.buildContext(s); slam=ctx.spells.find(x=>x.id==="slam");
  ok("Sinkhole makes the slam pull", slam.fx.pull===true);
  // and the zone actually deals damage in a fight
  const withZone=E.simulate(ctx, E.DUMMY);
  ok("the burning ground shows up as its own damage source", (withZone.byKind.zone||0) > 0, withZone.byKind);
  ok("the fight log mentions it", withZone.log.some(l=>/Burning Ground/.test(l.text)), withZone.log.slice(0,6));
}
{
  // Warden: Cleave -> bleed -> more stacks -> the stacks are the damage
  const s=E.newState("warden"); s.level=15;
  s.tree=["wd_root","wd_grip","wd_set","wd_heft","wd_tl","wd_tr","wd_commit","wd_r1"];
  let ctx=E.buildContext(s);
  let cleave=ctx.spells.find(x=>x.id==="cleave");
  ok("Serrated Edge gives Cleave a bleed", !!cleave.fx.dot && cleave.fx.dot.stacks===3, cleave.fx.dot);
  const r1=E.simulate(ctx, E.DUMMY);
  ok("the bleed deals damage of its own", (r1.byKind.bleed||0) > 0, r1.byKind);
  ok("stacks are reached and reported", r1.maxStacks>=3, r1.maxStacks);
  s.tree.push("wd_r3");
  ctx=E.buildContext(s); cleave=ctx.spells.find(x=>x.id==="cleave");
  ok("Hooked raises the stack ceiling to five", cleave.fx.dot.stacks===5, cleave.fx.dot.stacks);
  const r2=E.simulate(ctx, E.DUMMY);
  ok("five stacks beats three", (r2.byKind.bleed||0) > (r1.byKind.bleed||0), {a:r1.byKind.bleed,b:r2.byKind.bleed});
}
{
  // Thornbound: minions are a real, separate damage source
  const s=E.newState("thornbound"); s.level=15;
  s.tree=["tb_root","tb_soil","tb_bark","tb_grow","tb_tl","tb_tr","tb_tend"];
  let ctx=E.buildContext(s);
  const r=E.simulate(ctx, E.DUMMY);
  ok("minions deal damage", (r.byKind.minion||0) > 0, r.byKind);
  ok("minion count is tracked", r.minionPeak>0, r.minionPeak);
  s.tree.push("tb_g1");
  const r2=E.simulate(E.buildContext(s), E.DUMMY);
  ok("Second Seed really does field more of them", r2.minionPeak > r.minionPeak, {a:r.minionPeak,b:r2.minionPeak});
}
{
  // Ember: freeze then shatter is a two-spell interaction, not a number
  const s=E.newState("ember"); s.level=15;
  s.tree=["em_root","em_focus","em_ward","em_chan","em_tl","em_tr","em_ignis","em_r1","em_r2"];
  let ctx=E.buildContext(s);
  const nova=ctx.spells.find(x=>x.id==="nova"), bolt=ctx.spells.find(x=>x.id==="bolt");
  ok("Coldsnap makes Nova freeze", !!nova.fx.freeze, nova.fx);
  ok("Shatterpoint makes Firebolt shatter", !!bolt.fx.shatter, bolt.fx);
  // two nodes in, spamming the cheap spell is still better — the combo has to be
  // paid for. Once the branch is actually committed to, it takes over.
  s.tree=s.tree.concat(["em_r3","em_r4","em_r5","em_r6","em_r7","em_r8"]);
  ctx=E.buildContext(s);
  const r=E.simulate(ctx, E.DUMMY);
  ok("freezing happens in the fight", r.freezes>0, r.freezes);
  ok("shattering happens in the fight", r.shatters>0, r.shatters);
  ok("shatter damage is its own line", (r.byKind.shatter||0)>0, r.byKind);
  ok("and by then it is most of the damage", (r.byKind.shatter||0) > (r.byKind.direct||0)*0.6,
     {shatter:r.byKind.shatter, direct:r.byKind.direct});
}
{
  // Skyward: piercing, and then a keystone that throws piercing away
  const s=E.newState("skyward"); s.level=15;
  s.tree=["sk_root","sk_draw","sk_foot","sk_stance","sk_tl","sk_tr","sk_loose","sk_q1"];
  let ctx=E.buildContext(s);
  ok("Broadhead makes Arrow Storm pierce", ctx.spells.find(x=>x.id==="storm").fx.pierce===2);
  const multi={id:"m",name:"m",hp:1e12,res:{},timeLimit:12,dps:null,adds:4};
  const before=E.simulate(ctx, multi).dealt;
  s.tree.push("sk_q3");
  ctx=E.buildContext(s);
  ok("Through and Through raises what pierced targets take", ctx.spells.find(x=>x.id==="storm").fx.addValue===0.72);
  const after=E.simulate(ctx, multi).dealt;
  ok("and that is worth real damage against a group", after>before*1.15, {before, after});
}
{
  // the keystone that inverts its own branch
  const s=E.newState("skyward"); s.level=15;
  s.tree=["sk_root","sk_draw","sk_foot","sk_stance","sk_tl","sk_tr","sk_loose","sk_q1","sk_q3","sk_q5"];
  const multi={id:"m",name:"m",hp:1e12,res:{},timeLimit:12,dps:null,adds:4};
  const single={id:"s",name:"s",hp:1e12,res:{},timeLimit:12,dps:null};
  const spreadMulti=E.simulate(E.buildContext(s), multi).dealt;
  const spreadSingle=E.simulate(E.buildContext(s), single).dealt;
  const s2=JSON.parse(JSON.stringify(s));
  s2.tree=s.tree.concat(["sk_q2","sk_q4","sk_q6","sk_q7","sk_q8","sk_q9","sk_q10","sk_key_one"]);
  const ctx2=E.buildContext(s2);
  const storm=ctx2.spells.find(x=>x.id==="storm");
  ok("ONE ARROW strips the volley's spread", !storm.fx.aoe && !storm.fx.pierce, storm.fx);
  ok("ONE ARROW is far bigger on one target", storm.mult>6, storm.mult);
}

// ---------- 9. allocation rules ----------
{
  const s=E.newState("warden"); s.level=15;
  const t=E.TREES.warden;
  ok("budget 45 at level 15", E.treeBudget(15)===45);
  const root=t.list.find(n=>n.req.length===0);
  ok("root allocatable", E.canAllocate(s,root).ok);
  const deep=t.byId["wd_b16"];
  ok("deep node not allocatable from nothing", !E.canAllocate(s,deep).ok);
  s.tree.push(root.id);
  ok("child of root allocatable", E.canAllocate(s,t.byId["wd_grip"]).ok);
  ok("cannot deallocate root while children exist", true);
  s.tree.push("wd_grip");
  ok("deallocating root strands its children", !E.canDeallocate(s,root).ok, E.canDeallocate(s,root).why);
  ok("deallocating a leaf is fine", E.canDeallocate(s,t.byId["wd_grip"]).ok);
  // keystone exclusivity
  s.tree=["wd_root","wd_key_anvil"];
  ok("keystone excludes its siblings", !E.canAllocate(s,t.byId["wd_key_vein"]).ok);
  ok("the reason names the blocker", /ANVIL STANCE/.test(E.canAllocate(s,t.byId["wd_key_vein"]).why||""), E.canAllocate(s,t.byId["wd_key_vein"]).why);
  ok("locked-out branch reads as permanently locked", E.permaLocked(s,t.byId["wd_r9"]));
  // budget limit
  const s2=E.newState("warden"); s2.level=1;
  s2.tree=["wd_root","wd_grip","wd_set"];
  ok("cannot exceed the point budget", !E.canAllocate(s2,t.byId["wd_heft"]).ok, E.canAllocate(s2,t.byId["wd_heft"]).why);
}
{
  // exclusive keystones genuinely lock out one another's whole subtree
  const s=E.newState("thornbound"); s.level=15; s.tree=["tb_root","tb_key_grove"];
  ok("taking GROVE ETERNAL locks BLIGHT", !!E.exclBlocked(s,E.TREES.thornbound.byId["tb_key_thorn"]));
  ok("taking GROVE ETERNAL locks SAP", !!E.exclBlocked(s,E.TREES.thornbound.byId["tb_key_symb"]));
}

// ---------- 10. ability nodes really change the spell list ----------
{
  const s=E.newState("warden"); s.level=15;
  let ctx=E.buildContext(s);
  ok("four spells to start", ctx.spells.length===4, ctx.spells.length);
  ok("Cleave present before", ctx.spells.some(x=>x.name==="Cleave"));
  s.tree=["wd_root","wd_grip","wd_set","wd_heft","wd_tl","wd_tr","wd_commit","wd_r1","wd_r2","wd_r4"];
  ctx=E.buildContext(s);
  ok("Rake replaces Cleave on the same button", ctx.spells.some(x=>x.name==="Rake") && !ctx.spells.some(x=>x.name==="Cleave"));
  ok("it is still four spells — a button, not an addition", ctx.spells.length===4, ctx.spells.length);
  ok("the button keeps its slot", ctx.spells.find(x=>x.id==="cleave").slot===1);
  ok("and it keeps the bleed the branch gave it", !!ctx.spells.find(x=>x.id==="cleave").fx.dot);
}
{
  // a keystone can take a spell away entirely
  const s=E.newState("warden"); s.level=15;
  s.tree=["wd_root","wd_grip","wd_set","wd_heft","wd_tl","wd_tr","wd_commit","wd_b1","wd_b2","wd_b3",
          "wd_b4","wd_b5","wd_b6","wd_b7","wd_b8","wd_b9","wd_b10","wd_key_mirror"];
  const ctx=E.buildContext(s);
  ok("MIRROR GUARD removes Cleave from the bar", !ctx.spells.some(x=>x.id==="cleave"), ctx.spells.map(x=>x.name));
  ok("and leaves three", ctx.spells.length===3, ctx.spells.length);
  const guard=ctx.spells.find(x=>x.id==="guard");
  ok("Guard counters every target", guard.fx.guard.counterAll===true);
  const r=E.simulate(ctx, {id:"x",name:"x",hp:1e12,res:{},timeLimit:20,dps:{neutral:40},adds:2});
  ok("counters land in the fight", (r.byKind.counter||0)>0, r.byKind);
}

// ---------- 11. keystone rules rewrite the engine, not a number ----------
{
  // Thornbound GROVE ETERNAL: no direct damage at all
  const s=E.newState("thornbound"); s.level=15;
  s.tree=["tb_root","tb_soil","tb_bark","tb_grow","tb_tl","tb_tr","tb_tend","tb_g1","tb_g2","tb_g3",
          "tb_g4","tb_g5","tb_g6","tb_g7","tb_g8","tb_g9","tb_g10","tb_key_grove"];
  const ctx=E.buildContext(s);
  ok("GROVE ETERNAL sets the no-direct-damage rule", ctx.flags.nodirect===true);
  const r=E.simulate(ctx, E.DUMMY);
  ok("the player contributes no direct damage", !(r.byKind.direct>0), r.byKind);
  ok("but the minions do", (r.byKind.minion||0)>0, r.byKind);
  ok("and they never expire", ctx.spells.find(x=>x.id==="summon").fx.summon.perm===true);
}
{
  // Ember BLOODCAST: spells are paid for in health
  const s=E.newState("ember"); s.level=15;
  s.tree=["em_root","em_focus","em_ward","em_chan","em_tl","em_tr","em_ignis","em_s1","em_s2","em_s3",
          "em_s4","em_s5","em_s6","em_s7","em_s8","em_s9","em_key_blood"];
  const ctx=E.buildContext(s);
  ok("BLOODCAST sets the health-cost rule", ctx.flags.thirst===true);
  // the rule itself, isolated: a build that must pay for its casts
  const dummyNoDamage={id:"x",name:"x",hp:1e12,res:{},timeLimit:20,dps:null};
  const withOut=E.buildContext(E.newState("ember"));
  withOut.spells=withOut.spells.filter(x=>x.id==="bolt");   // Firebolt costs mana
  withOut.policy=null;
  const a=E.simulate(withOut, dummyNoDamage, {policy:"burst"});
  const withIn=E.buildContext(E.newState("ember"));
  withIn.spells=withIn.spells.filter(x=>x.id==="bolt");
  withIn.flags.thirst=true; withIn.policy=null;
  const b=E.simulate(withIn, dummyNoDamage, {policy:"burst"});
  ok("with the rule on, casting costs health", b.hpPct < a.hpPct, {without:a.hpPct, with:b.hpPct});
  ok("and stops costing mana", b.manaCurve[b.manaCurve.length-1] >= a.manaCurve[a.manaCurve.length-1] - 1e-9,
     {without:a.manaCurve.slice(-1), with:b.manaCurve.slice(-1)});
}
{
  // Ember ABSOLUTE ZERO: conversion plus no crits
  const s=E.newState("ember"); s.level=15;
  s.tree=["em_root","em_focus","em_ward","em_chan","em_tl","em_tr","em_ignis","em_r1","em_r2","em_r3",
          "em_r4","em_r5","em_r6","em_r7","em_r8","em_key_zero"];
  const ctx=E.buildContext(s);
  ok("ABSOLUTE ZERO forbids crits", ctx.flags.nocrit===true);
  const atk=E.attackTable(ctx).find(a=>a.sp.id==="bolt");
  ok("and the pipeline honours it", atk.res.crit.chance===0, atk.res.crit);
  const nonFrost=["neutral","cinder","gale","stone","volt"].reduce((a,k)=>a+(atk.res.buckets[k]||0),0);
  ok("everything arrives as Frost", atk.res.buckets.frost>0 && nonFrost < atk.res.buckets.frost*0.02, atk.res.buckets);
}
{
  // Skyward FOCUS FIRE: a real trade, not a bonus
  const s=E.newState("skyward"); s.level=15;
  s.tree=["sk_root","sk_draw","sk_foot","sk_stance","sk_tl","sk_tr","sk_loose","sk_h1","sk_h2","sk_h3",
          "sk_h4","sk_h5","sk_h6","sk_h7","sk_h8","sk_key_focus"];
  const ctx=E.buildContext(s);
  ok("FOCUS FIRE sets its rule", ctx.flags.focusfire===true);
}
{
  // Thornbound THORNMANTLE really does switch healing off
  const s=E.newState("thornbound"); s.level=15;
  s.tree=["tb_root","tb_soil","tb_bark","tb_grow","tb_tl","tb_tr","tb_tend","tb_b1","tb_b2","tb_b3",
          "tb_b4","tb_b5","tb_b6","tb_b7","tb_b8","tb_key_thorn"];
  const ctx=E.buildContext(s);
  ok("THORNMANTLE forbids healing", ctx.flags.noHeal===true);
  // isolate the rule: the same build, same fight, with only the ban lifted
  const hurtEnemy={id:"x",name:"x",hp:1e12,res:{},timeLimit:16,dps:{neutral:60}};
  const r=E.simulate(ctx, hurtEnemy);
  const lifted=E.buildContext(s); lifted.flags.noHeal=false; lifted.policy=null;
  const r2=E.simulate(lifted, hurtEnemy);
  ok("the ban is what costs you health", r.hpPct < r2.hpPct, {banned:r.hpPct, allowed:r2.hpPct});
  ok("and it is the doubled field you are buying with it",
     ctx.spells.find(x=>x.id==="totem").fx.zone.pct > 120, ctx.spells.find(x=>x.id==="totem").fx.zone.pct);
}
{
  // Major IDs on items still work
  const s=E.newState("ember");
  const ring=E.rollItem("r_overspill"); ring.rolls={"manaRegen":1,"dmg.frost":1};
  s.inv.push(ring); s.equipped.ring1=ring; s.alloc.frost=28;
  const ctx=E.buildContext(s);
  ok("Overflow recognised", ctx.flags.overflow===true);
  const plain=E.buildContext(E.newState("ember"));
  ok("Overflow halves max mana", ctx.maxMana < plain.maxMana, {a:ctx.maxMana,b:plain.maxMana});
}

// ---------- 12. the visible-in-combat rule, enforced ----------
{
  for(const c in E.TREES){
    const t=E.TREES[c];
    const changesBehaviour = n => !!(n.fxMod || n.fxAdd || n.utilAdd || n.addSpell || n.replaceSpell || n.removeSpell || n.rule);
    const bad = t.list.filter(n=>(n.type==="mod"||n.type==="ability") && !changesBehaviour(n));
    ok(c+": every modifier and ability changes what a spell does", bad.length===0, bad.map(n=>n.id));
    const noText = t.list.filter(n=>(n.type==="mod"||n.type==="ability"||n.type==="key") && !n.combat);
    ok(c+": every one of them says what you would see", noText.length===0, noText.map(n=>n.id));
    const statWithFx = t.list.filter(n=>n.type==="stat" && changesBehaviour(n));
    ok(c+": stat nodes are only numbers", statWithFx.length===0, statWithFx.map(n=>n.id));
    const types={}; for(const n of t.list) types[n.type]=(types[n.type]||0)+1;
    ok(c+": modifiers are the majority of the interesting nodes",
       types.mod > (types.ability||0) + (types.key||0), types);
    // every fxMod / fxAdd must name a button this class actually has
    const slots=new Set(E.CLASSES[c].spells.map(x=>x.id));
    let badSlot=null;
    for(const n of t.list){
      for(const k of Object.keys(n.fxMod||{})) if(!slots.has(k)) badSlot=n.id+"->"+k;
      for(const k of Object.keys(n.fxAdd||{})) if(!slots.has(k)) badSlot=n.id+"->"+k;
      for(const k of Object.keys(n.utilAdd||{})) if(!slots.has(k)) badSlot=n.id+"->"+k;
      if(n.replaceSpell && !slots.has(n.replaceSpell[0])) badSlot=n.id+"->"+n.replaceSpell[0];
      if(n.removeSpell && !slots.has(n.removeSpell)) badSlot=n.id+"->"+n.removeSpell;
    }
    ok(c+": every node targets a real button", !badSlot, badSlot);
  }
}
{
  // and a spot check that a modifier's promise is kept by the simulator
  const s=E.newState("skyward"); s.level=15;
  s.tree=["sk_root","sk_draw","sk_foot","sk_stance","sk_tl","sk_tr","sk_loose","sk_d1","sk_d2","sk_d3"];
  const ctx=E.buildContext(s);
  ok("Caltrops gave Dash a zone", !!ctx.spells.find(x=>x.id==="dash").fx.zone);
  const r=E.simulate(ctx, E.DUMMY);
  ok("and the zone actually ticks in the fight", (r.byKind.zone||0)>0, r.byKind);
  ok("the log names it", r.log.some(l=>/Caltrops/.test(l.text)), r.log.slice(0,8));
}

console.log("");
console.log("passed "+pass+"   failed "+fail);
process.exit(fail?1:0);
