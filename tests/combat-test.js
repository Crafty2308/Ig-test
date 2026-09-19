const path=require('path');
const PAGE=path.join(__dirname,'..','theorycraft.html');
const PAGE_URL='file://'+PAGE;
const {chromium}=require('playwright');
let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c)pass++; else {fail++; console.log("FAIL: "+n+(x!==undefined?"  -> "+JSON.stringify(x):""));} };
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push("PAGEERROR: "+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push("CONSOLE: "+m.text());});
  await p.goto(PAGE_URL);
  await p.waitForTimeout(400);
  await p.click('[data-cls="ember"]'); await p.waitForTimeout(250);
  await p.click('[data-scr="World"]'); await p.waitForTimeout(600);

  const R = await p.evaluate(()=>{
    const out = {};
    // an inert target: a real enemy with its brain switched off
    const bag = (x,y)=>{ const e = spawnEnemy("husk", x, y); e.state="idle"; e.inert=true;
                         e.hp=e.maxHp=4000; e.res={}; return e; };
    const reset = ()=>{ G.enemies.length=0; G.projs.length=0; G.zones.length=0; G.minions.length=0;
                        G.pickups.length=0; G.floaters.length=0; resetTelemetry();
                        G.player.hp=G.player.maxHp; G.player.mana=G.player.maxMana; G.player.iframe=0;
                        G.player.x=450; G.player.y=2300; };   // authored clear ground, nothing in the way
    const bolt = ()=>CTX.spells.find(s=>s.id==="bolt");
    const run = n=>{ for(let i=0;i<n;i++) stepWorld(1/60); };

    // 1. a projectile that flies past deals nothing
    reset(); let e = bag(G.player.x+400, G.player.y);
    castSpell(bolt(), G.player.x, G.player.y-600); run(120);
    out.missDealsZero = (e.hp === e.maxHp && G.telemetry.dealt === 0);

    // 2. the same spell aimed at the body connects
    reset(); e = bag(G.player.x+400, G.player.y);
    castSpell(bolt(), e.x, e.y); run(120);
    out.hitDealsDamage = e.hp < e.maxHp;

    // 3. it takes time to get there
    reset(); e = bag(G.player.x+520, G.player.y);
    castSpell(bolt(), e.x, e.y);
    out.notInstant = (e.hp === e.maxHp);
    run(3); out.stillTravelling = (e.hp === e.maxHp && G.projs.length === 1);
    run(120); out.arrivesEventually = e.hp < e.maxHp;

    // 4. a wall stops it
    reset(); e = bag(750, 2300);
    WORLD.walls.push({x:600, y:2230, w:40, h:160});
    castSpell(bolt(), e.x, e.y); run(90);
    out.wallStopsProjectile = (e.hp === e.maxHp);
    WORLD.walls.pop();

    // 5. melee swings at air do nothing, and only the active window connects
    reset(); 
    e = bag(G.player.x+60, G.player.y);
    const melee = {id:"__t", name:"t", mult:1, flatScale:1, fx:{}, form:"melee",
                   reach:90, arc:100, windup:0.15, active:0.10, recover:0.15, cost:0, time:0.4};
    castSpell(melee, G.player.x-200, G.player.y);           // swing away from it
    run(40); out.swingAtAirMisses = (e.hp === e.maxHp);
    castSpell(melee, e.x, e.y); 
    run(6); out.noHitDuringWindup = (e.hp === e.maxHp);
    run(20); out.hitInActiveWindow = (e.hp < e.maxHp);

    // 6. an area shape only touches what is inside it
    reset(); 
    const near = bag(G.player.x+80, G.player.y);
    const far  = bag(G.player.x+600, G.player.y);
    castSpell(CTX.spells.find(s=>s.id==="nova"), G.player.x+100, G.player.y); run(40);
    out.aoeHitsInside = near.hp < near.maxHp;
    out.aoeMissesOutside = far.hp === far.maxHp;

    // 7. enemy telegraphs: walking out is always safe
    reset(); 
    e = spawnEnemy("husk", G.player.x+60, G.player.y);
    startEnemyAttack(e, ENEMY.husk);
    const hp0 = G.player.hp;
    for(let i=0;i<50;i++){ G.player.x += 11; stepWorld(1/60); }
    out.walkingOutTakesNothing = (G.player.hp === hp0);
    G.player.x = e.x + 40; e.atkCd = 0; e.state="chase";
    startEnemyAttack(e, ENEMY.husk);
    run(55);
    out.standingInTakesDamage = (G.player.hp < hp0);

    // 8. i-frames
    reset(); 
    e = spawnEnemy("husk", G.player.x+50, G.player.y);
    startEnemyAttack(e, ENEMY.husk); G.player.iframe = 5;
    const hp1 = G.player.hp; run(55);
    out.iframesNegate = (G.player.hp === hp1);

    // 9. damage numbers appear at the point of impact
    reset(); e = bag(G.player.x+300, G.player.y);
    castSpell(bolt(), e.x, e.y);
    let popped=null;
    for(let i=0;i<120;i++){ stepWorld(1/60); if(G.floaters.length && !popped) popped={...G.floaters[0]}; }
    out.numberPopsAtImpact = !!popped && Math.hypot(popped.x-e.x, popped.y-e.y) < e.r+30;

    // 10. knockback and hitstop
    reset(); 
    e = bag(G.player.x+70, G.player.y);
    const x0 = e.x;
    castSpell(melee, e.x, e.y); run(26);
    out.knockbackMovesIt = e.x > x0 + 4;

    // 11. nothing is damaged without a collision: fire into empty space repeatedly
    reset();
    const far2 = bag(G.player.x+900, G.player.y+900);
    for(let k=0;k<6;k++){ castSpell(bolt(), G.player.x, G.player.y-800); run(40); }
    out.noPhantomDamage = (far2.hp === far2.maxHp && G.telemetry.dealt === 0);

    // 12. loot only comes from a table
    reset(); e = spawnEnemy("husk", G.player.x+60, G.player.y);
    const invBefore = S.inv.length;
    for(let i=0;i<400 && !e.dead;i++){ dealDamage(e, spellRes(bolt()), {mul:3, noCrit:true}); if(e.dead) break; }
    out.killDropsSomething = G.pickups.length > 0;
    out.everyDropIsFromATable = G.pickups.filter(k=>k.kind==="item")
        .every(k => (LOOT.enemy.husk||[]).some(d=>d.id===k.inst.def));
    return out;
  });
  for(const k in R) ok(k, R[k], R[k]);
  ok("no runtime errors", errs.length===0, errs);
  console.log("\ncombat: passed "+pass+"  failed "+fail);
  await b.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error("FATAL",e);process.exit(1);});
