const path=require('path');
const PAGE=path.join(__dirname,'..','theorycraft.html');
const PAGE_URL='file://'+PAGE;
const fs=require('fs');
const TAU=Math.PI*2;
const src=fs.readFileSync(PAGE,'utf8');
// pull just the pure geometry out of the page and run it standalone
const names=['clampN','len','norm','angDiff','segCircle','circHit','arcHit','boxHit','ringHit'];
let code='const TAU=Math.PI*2;\n';
for(const n of names){
  const m=src.match(new RegExp('\\nfunction '+n+'\\([\\s\\S]*?\\n\\}','m'));
  if(!m) throw new Error('missing '+n);
  code+=m[0]+'\n';
}
code+='module.exports={'+names.join(',')+'};';
const m={exports:{}}; new Function('module','exports',code)(m,m.exports);
const {segCircle,circHit,arcHit,boxHit,ringHit,angDiff}=m.exports;
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c)pass++; else {fail++; console.log("FAIL: "+n+(x!==undefined?"  -> "+JSON.stringify(x):""));} };

// ---- swept projectile vs circle ----
ok("straight through the middle hits", segCircle(0,0, 100,0, 50,0, 10) >= 0);
ok("hit fraction is where it first touches", Math.abs(segCircle(0,0,100,0,50,0,10) - 0.40) < 1e-9, segCircle(0,0,100,0,50,0,10));
ok("passing above by more than the radius misses", segCircle(0,0, 100,0, 50,40, 10) === -1);
ok("grazing the edge counts", segCircle(0,0, 100,0, 50,9.9, 10) >= 0);
ok("stopping short misses", segCircle(0,0, 30,0, 50,0, 10) === -1);
ok("starting inside registers immediately", segCircle(50,0, 150,0, 50,0, 10) === 0);
ok("behind the start misses", segCircle(0,0, 100,0, -50,0, 10) === -1);
// the tunnelling case: 3000px/s projectile, one 1/60s step, 10px body
const step = 3000/60;
ok("a fast projectile cannot tunnel through a body",
   segCircle(0,0, step,0, 25,0, 10) >= 0, {step});
ok("a point-sized step still resolves", segCircle(10,10, 10,10, 10,10, 5) === 0);

// ---- circles ----
ok("touching circles overlap", circHit(0,0,10, 19,0,10));
ok("separated circles do not", !circHit(0,0,10, 21,0,10));

// ---- melee arc ----
const R=100, H=50*Math.PI/180;   // 100 reach, 100 degree total arc
ok("dead ahead is hit", arcHit(0,0, 0, R,H, 60,0, 8));
ok("behind is not", !arcHit(0,0, 0, R,H, -60,0, 8));
ok("outside reach is not", !arcHit(0,0, 0, R,H, 140,0, 8));
ok("just inside reach is", arcHit(0,0, 0, R,H, 95,0, 8));
ok("at the arc edge is hit", arcHit(0,0, 0, R,H, 60*Math.cos(H*0.9), 60*Math.sin(H*0.9), 8));
ok("well outside the arc is not", !arcHit(0,0, 0, R,H, 60*Math.cos(1.6), 60*Math.sin(1.6), 8));
ok("a wide body at the edge still connects", arcHit(0,0, 0, R,H, 60*Math.cos(H+0.12), 60*Math.sin(H+0.12), 22));
ok("standing on top of you always connects", arcHit(0,0, Math.PI, R,H, 3,0, 10));
ok("facing is respected", arcHit(0,0, Math.PI, R,H, -60,0, 8) && !arcHit(0,0, Math.PI, R,H, 60,0, 8));

// ---- oriented box ----
ok("inside the box", boxHit(0,0, 0, 200, 60, 100, 0, 6));
ok("beyond the far edge", !boxHit(0,0, 0, 200, 60, 230, 0, 6));
ok("off to the side", !boxHit(0,0, 0, 200, 60, 100, 60, 6));
ok("within half-width", boxHit(0,0, 0, 200, 60, 100, 25, 6));
ok("rotated 90 degrees follows the facing", boxHit(0,0, Math.PI/2, 200, 60, 0, 100, 6));
ok("and misses where it used to hit", !boxHit(0,0, Math.PI/2, 200, 60, 100, 0, 6));

// ---- expanding ring ----
ok("inside the band is hit", ringHit(0,0, 40, 60, 50,0, 5));
ok("inside the hole is not", !ringHit(0,0, 40, 60, 10,0, 5));
ok("outside is not", !ringHit(0,0, 40, 60, 90,0, 5));
ok("a body straddling the inner edge is hit", ringHit(0,0, 40, 60, 36,0, 6));

// ---- angles ----
ok("angle wrap is shortest-path", Math.abs(angDiff(0.1, TAU-0.1) - 0.2) < 1e-9);
console.log("\ngeometry: passed "+pass+"  failed "+fail);
process.exit(fail?1:0);
