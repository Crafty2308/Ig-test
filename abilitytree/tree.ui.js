/* ============================================================
   ability tree - UI

   Rendering approach: absolutely positioned DOM tiles over one SVG pipe
   layer - DOM gives hover, focus, keyboard and scrolling for free, while a
   single SVG plane lets parent->child elbows be deduplicated into shared
   trunks so multi-parent joins land on one clean pipe instead of N overlaps.

   Reads the rules only through AbilityTree.canUnlock / .unlock. No second
   copy of the rule logic lives here.
   ============================================================ */
(function (root, factory) {
  const T = (typeof module !== 'undefined' && module.exports) ? require('./tree.logic.js') : root.AbilityTree;
  const api = factory(T);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbilityTreeUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
  'use strict';

  const CELL_W = 104, CELL_H = 98;      // grid pitch
  const TILE_W = 84, TILE_H = 70;       // tile size inside the cell
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TIER_GLYPH = { white: '◆', yellow: '◈', red: '✦' };

  const CSS = `
.atree{--w:#cfe6ff;--y:#ffc857;--r:#ff4d6d;
  display:flex; flex-direction:column; height:100%; min-height:0;
  color:#cfe6ff; font:14px/1.4 "Segoe UI",Roboto,-apple-system,Helvetica,Arial,sans-serif;
  background:#070a12; border-radius:12px; overflow:hidden; position:relative;}
.atree *{box-sizing:border-box;}
.atree-hud{display:flex; flex-wrap:wrap; align-items:center; gap:10px;
  padding:10px 14px; background:rgba(12,20,36,.96); border-bottom:1px solid rgba(120,150,190,.22); flex:0 0 auto;}
.atree-pts{font-weight:800; font-size:17px; color:#eaf6ff; letter-spacing:.04em;}
.atree-who{font-weight:800; font-size:15px; letter-spacing:.06em; color:#eaf6ff;}
.atree-who small{display:block; font-size:10px; font-weight:600; letter-spacing:.14em; color:#7e9bc4; text-transform:uppercase;}
.atree-pts small{display:block; font-size:10px; font-weight:600; letter-spacing:.14em; color:#7e9bc4; text-transform:uppercase;}
.atree-arch{display:flex; gap:8px; flex-wrap:wrap;}
.atree-chip{display:flex; align-items:center; gap:6px; padding:4px 10px; border-radius:20px;
  background:rgba(255,255,255,.04); border:1px solid rgba(120,150,190,.22); font-size:12px;}
.atree-chip b{font-size:14px; color:#eaf6ff;}
.atree-chip.dom{box-shadow:0 0 0 1px currentColor inset;}
.atree-dot{width:8px; height:8px; border-radius:50%; background:currentColor;}
.atree-spacer{flex:1 1 auto;}
.atree-btn{padding:7px 14px; border:1px solid rgba(255,77,109,.5); border-radius:8px; cursor:pointer;
  background:transparent; color:#ff8fa3; font:700 12px/1 inherit; letter-spacing:.08em; text-transform:uppercase;}
.atree-btn:hover{background:rgba(255,77,109,.14);}
.atree-note{width:100%; font-size:12px; color:#ffc857;}
.atree-scroll{flex:1 1 auto; min-height:0; overflow:auto; padding:18px;}
.atree-grid{position:relative; margin:0 auto;}
.atree-pipes{position:absolute; inset:0; overflow:visible; pointer-events:none;}
.atree-node{position:absolute; margin:0; padding:5px 6px; cursor:pointer; text-align:center;
  background:rgba(10,18,34,.96); border:1px solid rgba(120,150,190,.25); border-radius:10px;
  color:#8fb2d8; font:inherit; transition:transform .1s, box-shadow .1s, border-color .1s, opacity .1s;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;}
.atree-node .g{font-size:17px; line-height:1;}
.atree-node .n{font-size:10.5px; font-weight:700; line-height:1.15; letter-spacing:.01em;}
.atree-node .c{font-size:9px; letter-spacing:.1em; color:#5f7ba3;}
.atree-node:focus{outline:2px solid #40e0ff; outline-offset:2px;}
/* tier */
.atree-node.t-white .g{color:var(--w);} .atree-node.t-yellow .g{color:var(--y);} .atree-node.t-red .g{color:var(--r);}
.atree-node.t-yellow{border-style:dashed;}
.atree-node.t-red{border-width:2px; border-radius:14px;}
/* status */
.atree-node.s-locked{opacity:.34;}
.atree-node.s-available{opacity:.72;}
.atree-node.s-reachable{border-color:#40e0ff; color:#cfe6ff; box-shadow:0 0 14px rgba(64,224,255,.25);}
.atree-node.s-reachable:hover{transform:translateY(-2px); box-shadow:0 0 22px rgba(64,224,255,.45);}
.atree-node.s-unlocked{color:#eaf6ff; background:rgba(18,38,28,.96); border-color:#9dff5c;}
.atree-node.s-unlocked.t-yellow{background:rgba(44,36,14,.96); border-color:var(--y);}
.atree-node.s-unlocked.t-red{background:rgba(48,16,26,.96); border-color:var(--r); box-shadow:0 0 20px rgba(255,77,109,.3);}
.atree-node.s-blocked{opacity:.4; border-color:rgba(255,77,109,.6); cursor:not-allowed;}
.atree-node.s-blocked .n{text-decoration:line-through;}
.atree-node .arch{position:absolute; left:0; top:8px; bottom:8px; width:3px; border-radius:2px; background:currentColor;}
/* tooltip */
.atree-tip{position:fixed; z-index:60; max-width:290px; padding:11px 13px; pointer-events:none; opacity:0;
  background:rgba(8,14,26,.985); border:1px solid rgba(120,150,190,.35); border-radius:10px;
  box-shadow:0 10px 34px rgba(0,0,0,.6); transition:opacity .08s; font-size:12.5px;}
.atree-tip.show{opacity:1;}
.atree-tip h4{margin:0 0 2px; font-size:14.5px; color:#eaf6ff; letter-spacing:.03em;}
.atree-tip .meta{font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:7px;}
.atree-tip .desc{color:#a8c6e8; line-height:1.5; margin-bottom:7px;}
.atree-tip .eff{color:#9dff5c; font-size:12px; line-height:1.5;}
.atree-tip .eff.neg{color:#ff8fa3;}
.atree-tip .why{margin-top:8px; padding-top:7px; border-top:1px solid rgba(120,150,190,.2); color:#ff8fa3; line-height:1.55;}
.atree-tip .why b{display:block; color:#ffc857; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:3px;}
.atree-tip .got{margin-top:8px; padding-top:7px; border-top:1px solid rgba(157,255,92,.25); color:#9dff5c;}
/* confirm */
.atree-confirm{position:absolute; inset:0; z-index:70; display:none; align-items:center; justify-content:center;
  background:rgba(4,8,16,.82); padding:20px;}
.atree-confirm.show{display:flex;}
.atree-confirm .box{max-width:380px; text-align:center; padding:22px 20px; border-radius:12px;
  background:#0c1424; border:1px solid rgba(255,77,109,.45);}
.atree-confirm h3{margin:0 0 8px; color:#eaf6ff; font-size:19px;}
.atree-confirm p{margin:0 0 16px; color:#a8c6e8; font-size:13px; line-height:1.55;}
.atree-confirm .row{display:flex; gap:10px; justify-content:center;}
.atree-confirm button{padding:9px 18px; border-radius:8px; cursor:pointer; font:700 12px/1 inherit;
  letter-spacing:.08em; text-transform:uppercase; border:1px solid rgba(120,150,190,.3); background:transparent; color:#a8c6e8;}
.atree-confirm button.yes{background:#ff4d6d; border-color:#ff4d6d; color:#2a0410;}
@media (max-width:640px){ .atree-scroll{padding:10px;} .atree-hud{padding:8px 10px; gap:7px;} }
`;

  function injectCss() {
    if (document.getElementById('atree-css')) return;
    const st = document.createElement('style');
    st.id = 'atree-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const cx = n => n.col * CELL_W + CELL_W / 2;
  const cy = n => n.row * CELL_H + CELL_H / 2;
  const archColor = (idx, a) => (a && idx.archetypes[a] ? idx.archetypes[a].color : '#8fb2d8');

  /* human readable effect lines, also used by the tooltip */
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  function effectLines(node) {
    const list = node.effects || (node.effect ? [node.effect] : []);
    const out = [];
    for (const e of list) {
      // a flag that just restates the node name adds nothing to the tooltip
      if (e.flag && norm(node.name).startsWith(norm(e.flag))) continue;
      out.push(e);
    }
    return out.map(e => {
      if (e.flag) return { text: flagText(e.flag), neg: false };
      const nice = e.stat.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      if (e.op === 'mult') {
        const pct = Math.round((e.value - 1) * 100);
        return { text: (pct >= 0 ? '+' : '') + pct + '% ' + nice, neg: pct < 0 };
      }
      const v = e.value;
      const pctStat = /chance|power|armor/i.test(e.stat);
      const shown = pctStat ? Math.round(v * 100) + '%' : v;
      return { text: (v >= 0 ? '+' : '') + shown + ' ' + nice, neg: v < 0 };
    });
  }
  function flagText(flag) {
    const words = flag.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    return 'Unlocks: ' + words.charAt(0).toUpperCase() + words.slice(1);
  }

  /* ---------------- mount ---------------- */
  function mount(container, opts) {
    injectCss();
    opts = opts || {};
    let state = opts.state || T.load();
    const onChange = opts.onChange || function () {};

    const rootEl = el('div', 'atree');
    const hud = el('div', 'atree-hud');
    const who = el('div', 'atree-who');
    const pts = el('div', 'atree-pts');
    const chips = el('div', 'atree-arch');
    const spacer = el('div', 'atree-spacer');
    const resetBtn = el('button', 'atree-btn', 'Reset tree');
    const note = el('div', 'atree-note');
    hud.append(who, pts, chips, spacer, resetBtn, note);

    const scroll = el('div', 'atree-scroll');
    const tip = el('div', 'atree-tip');
    const confirm = el('div', 'atree-confirm',
      '<div class="box"><h3>Reset this ability tree?</h3>' +
      '<p id="atree-confirm-text"></p>' +
      '<div class="row"><button class="yes">Reset</button><button class="no">Cancel</button></div></div>');
    rootEl.append(hud, scroll, tip, confirm);
    container.innerHTML = '';
    container.appendChild(rootEl);

    /* rebuilt whenever the active character changes */
    let idx = null, tiles = {}, segs = null, junctionDots = [], svg = null, builtFor = null;

    function build() {
      idx = T.activeTree(state);
      builtFor = idx.charId;
      tiles = {};
      segs = new Map();
      junctionDots = [];
      scroll.innerHTML = '';

      const rows = Math.max.apply(null, idx.nodes.map(n => n.row)) + 1;
      const cols = T.COLS || (Math.max.apply(null, idx.nodes.map(n => n.col)) + 1);

      const grid = el('div', 'atree-grid');
      grid.style.width = cols * CELL_W + 'px';
      grid.style.height = rows * CELL_H + 'px';
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'atree-pipes');
      svg.setAttribute('width', cols * CELL_W);
      svg.setAttribute('height', rows * CELL_H);
      grid.appendChild(svg);
      scroll.appendChild(grid);

      for (const n of idx.nodes) {
        const b = el('button', 'atree-node t-' + n.tier);
        b.type = 'button';
        b.style.left = (cx(n) - TILE_W / 2) + 'px';
        b.style.top = (cy(n) - TILE_H / 2) + 'px';
        b.style.width = TILE_W + 'px';
        b.style.height = TILE_H + 'px';
        b.innerHTML = '<span class="g">' + (TIER_GLYPH[n.tier] || '\u25c6') + '</span>' +
                      '<span class="n">' + n.name + '</span>' +
                      '<span class="c">' + T.costOf(n) + ' pt' + (T.costOf(n) === 1 ? '' : 's') + '</span>';
        if (n.archetype) {
          const bar = el('span', 'arch');
          bar.style.color = archColor(idx, n.archetype);
          b.appendChild(bar);
        }
        b.addEventListener('click', () => clickNode(n.id));
        b.addEventListener('mouseenter', ev => showTip(n, ev.currentTarget));
        b.addEventListener('focus', ev => showTip(n, ev.currentTarget));
        b.addEventListener('mouseleave', hideTip);
        b.addEventListener('blur', hideTip);
        grid.appendChild(b);
        tiles[n.id] = b;
      }

      /* pipes: parent -> child elbows, deduplicated into shared trunks */
      const joins = new Map();
      function addSeg(x1, y1, x2, y2, parent, child) {
        if (x1 === x2 && y1 === y2) return;
        const key = [x1, y1, x2, y2].map(v => Math.round(v)).join(':');
        let s2 = segs.get(key);
        if (!s2) { s2 = { x1, y1, x2, y2, edges: [] }; segs.set(key, s2); }
        s2.edges.push({ parent, child });
        for (const p of [[x1, y1], [x2, y2]]) {
          const k = Math.round(p[0]) + ',' + Math.round(p[1]);
          joins.set(k, (joins.get(k) || 0) + 1);
        }
      }
      for (const n of idx.nodes) {
        for (const pid of (n.parents || [])) {
          const p = idx.byId[pid];
          if (!p) continue;
          const px = cx(p), py = cy(p), nx = cx(n), ny = cy(n);
          const midY = (py + ny) / 2;
          addSeg(px, py, px, midY, pid, n.id);     // down out of the parent
          addSeg(px, midY, nx, midY, pid, n.id);   // across the gutter
          addSeg(nx, midY, nx, ny, pid, n.id);     // down into the child
        }
      }
      for (const [, s2] of segs) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', s2.x1); line.setAttribute('y1', s2.y1);
        line.setAttribute('x2', s2.x2); line.setAttribute('y2', s2.y2);
        line.setAttribute('stroke-width', 4);
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
        s2.path = line;
      }
      for (const [k, count] of joins) {
        if (count < 3) continue;
        const parts = k.split(',').map(Number);
        const jx = parts[0], jy = parts[1];
        if (idx.nodes.some(n => Math.round(cx(n)) === jx && Math.round(cy(n)) === jy)) continue;
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', jx); dot.setAttribute('cy', jy); dot.setAttribute('r', 4.5);
        svg.appendChild(dot);
        junctionDots.push({ el: dot, x: jx, y: jy });
      }
    }

    /* --- painting --- */
    const PIPE = { off: 'rgba(120,150,190,.20)', live: 'rgba(64,224,255,.55)', on: '#9dff5c' };
    function paint() {
      const c = state.compiled;
      const t = T.TREES[idx.charId];

      who.innerHTML = (t.name || idx.charId.toUpperCase()) + '<small>ability tree</small>';
      pts.innerHTML = c.pointsLeft + ' <small>points left &middot; ' + c.pointsSpent + ' spent</small>';

      chips.innerHTML = '';
      for (const a of idx.archList) {
        const chip = el('div', 'atree-chip' + (c.dominant === a.id ? ' dom' : ''));
        chip.style.color = a.color;
        chip.title = a.blurb;
        chip.innerHTML = '<span class="atree-dot"></span><span style="color:#a8c6e8">' + a.name + '</span> <b>' +
                         (c.archetypeCounts[a.id] || 0) + '</b>';
        chips.appendChild(chip);
      }

      for (const n of idx.nodes) {
        const st = T.nodeStatus(n.id, state);
        const b = tiles[n.id];
        b.className = 'atree-node t-' + n.tier + ' s-' + st;
        b.setAttribute('aria-pressed', st === 'unlocked' ? 'true' : 'false');
      }

      for (const [, s2] of segs) {
        let best = 'off';
        for (const e of s2.edges) {
          const pOn = T.has(state, e.parent), cOn = T.has(state, e.child);
          if (pOn && cOn) { best = 'on'; break; }
          if (pOn) best = 'live';
        }
        s2.path.setAttribute('stroke', PIPE[best]);
        s2.state = best;
      }
      for (const d of junctionDots) {
        let best = 'off';
        for (const [, s2] of segs) {
          const touches = (Math.round(s2.x1) === d.x && Math.round(s2.y1) === d.y) ||
                          (Math.round(s2.x2) === d.x && Math.round(s2.y2) === d.y);
          if (!touches) continue;
          if (s2.state === 'on') { best = 'on'; break; }
          if (s2.state === 'live') best = 'live';
        }
        d.el.setAttribute('fill', PIPE[best]);
      }

      note.textContent = state.refunded && state.refunded.length
        ? 'A saved build referenced ' + state.refunded.length + ' ability that no longer exists \u2014 those points were refunded.'
        : '';
      if (tipNode && tiles[tipNode.id]) showTip(tipNode, tiles[tipNode.id]);
    }

    /* --- tooltip --- */
    let tipNode = null;
    function showTip(n, anchor) {
      tipNode = n;
      const unlocked = T.has(state, n.id);
      const check = T.canUnlock(n.id, state);
      const a = n.archetype ? idx.archetypes[n.archetype] : null;
      const tierLabel = T.TIER_LABEL[n.tier] || n.tier;

      let html = '<h4>' + n.name + '</h4>';
      html += '<div class="meta" style="color:' + (n.tier === 'red' ? '#ff4d6d' : n.tier === 'yellow' ? '#ffc857' : '#8fb2d8') + '">' +
              tierLabel + (a ? ' &middot; <span style="color:' + a.color + '">' + a.name + '</span>' : ' &middot; Neutral') +
              ' &middot; ' + T.costOf(n) + ' pt' + (T.costOf(n) === 1 ? '' : 's') + '</div>';
      html += '<div class="desc">' + n.desc + '</div>';
      for (const e of effectLines(n)) html += '<div class="eff' + (e.neg ? ' neg' : '') + '">' + e.text + '</div>';
      if (n.blocks && n.blocks.length) {
        html += '<div class="eff neg">Locks out: ' + n.blocks.map(b => (idx.byId[b] ? idx.byId[b].name : b)).join(', ') + '</div>';
      }
      if (unlocked) html += '<div class="got">Unlocked</div>';
      else if (!check.ok) html += '<div class="why"><b>Requires</b>' + check.reasons.map(r => '<div>' + r + '</div>').join('') + '</div>';
      else html += '<div class="got">Click to unlock</div>';

      tip.innerHTML = html;
      tip.classList.add('show');
      const r = anchor.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.right + 12, y = r.top - 6;
      if (x + tw > window.innerWidth - 8) x = r.left - tw - 12;
      if (x < 8) x = 8;
      if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
      if (y < 8) y = 8;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    function hideTip() { tipNode = null; tip.classList.remove('show'); }

    /* --- interaction --- */
    function clickNode(id) {
      const res = T.unlock(id, state);      // re-checks the same canUnlock the UI painted with
      if (res.ok) {
        paint();
        onChange(state);
      } else {
        const b = tiles[id];
        showTip(idx.byId[id], b);
        b.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
          { duration: 180 }
        );
      }
    }

    resetBtn.addEventListener('click', () => {
      confirm.querySelector('#atree-confirm-text').textContent =
        'Every ability in this character\u2019s tree is cleared and all ' + state.compiled.pointsSpent +
        ' spent points come back. Other characters are untouched.';
      confirm.classList.add('show');
    });
    confirm.querySelector('.no').addEventListener('click', () => confirm.classList.remove('show'));
    confirm.querySelector('.yes').addEventListener('click', () => {
      T.reset(state);
      state.refunded = null;
      confirm.classList.remove('show');
      paint();
      onChange(state);
    });

    build();
    paint();

    return {
      el: rootEl,
      refresh(next) {
        if (next) state = next;
        if (state.active !== builtFor) build();     // the player switched character
        paint();
      },
      getState() { return state; },
      destroy() { hideTip(); container.innerHTML = ''; }
    };
  }

  return { mount, CELL_W, CELL_H, effectLines };
});
