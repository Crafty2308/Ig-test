/* ============================================================
   ability tree - UI

   Rendering approach: absolutely positioned DOM tiles over one SVG pipe
   layer - DOM gives hover, focus, keyboard and scrolling for free, while a
   single SVG plane lets parent->child elbows be deduplicated into shared
   trunks, so the three columns can cross and converge on one clean pipe.

   Reads the rules only through AbilityTree.canUnlock / .unlock.
   ============================================================ */
(function (root, factory) {
  const T = (typeof module !== 'undefined' && module.exports) ? require('./tree.logic.js') : root.AbilityTree;
  const api = factory(T);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbilityTreeUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
  'use strict';

  const CELL_W = 152, CELL_H = 94;
  const TILE_W = 132, TILE_H = 74;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TIER_GLYPH = { white: '◆', yellow: '◈', red: '✦' };
  const RATING_ORDER = ['difficulty', 'damage', 'defense', 'range', 'speed'];
  const RATING_PIPS = { Low: 1, Medium: 2, High: 3 };

  const CSS = `
.atree{display:flex; flex-direction:column; height:100%; min-height:0; position:relative;
  color:#cfe6ff; font:14px/1.4 "Segoe UI",Roboto,-apple-system,Helvetica,Arial,sans-serif;
  background:#070a12; border-radius:12px; overflow:hidden;}
.atree *{box-sizing:border-box;}
.atree-hud{display:flex; flex-wrap:wrap; align-items:center; gap:10px; flex:0 0 auto;
  padding:9px 14px; background:rgba(12,20,36,.96); border-bottom:1px solid rgba(120,150,190,.22);}
.atree-who{font-weight:800; font-size:15px; letter-spacing:.06em; color:#eaf6ff;}
.atree-who small{display:block; font-size:10px; font-weight:600; letter-spacing:.14em; color:#7e9bc4; text-transform:uppercase;}
.atree-pts{font-weight:800; font-size:17px; color:#eaf6ff;}
.atree-pts small{display:block; font-size:10px; font-weight:600; letter-spacing:.14em; color:#7e9bc4; text-transform:uppercase;}
.atree-spacer{flex:1 1 auto;}
.atree-btn{padding:7px 14px; border:1px solid rgba(255,77,109,.5); border-radius:8px; cursor:pointer;
  background:transparent; color:#ff8fa3; font:700 12px/1 inherit; letter-spacing:.08em; text-transform:uppercase;}
.atree-btn:hover{background:rgba(255,77,109,.14);}
.atree-note{width:100%; font-size:12px; color:#ffc857;}
/* archetype column headers */
.atree-heads{position:relative; flex:0 0 auto; height:66px; background:rgba(9,15,28,.97);
  border-bottom:1px solid rgba(120,150,190,.18); overflow:hidden;}
.atree-headinner{position:relative; margin:0 auto; height:100%;}
.atree-head{position:absolute; top:8px; height:50px; padding:6px 8px; border-radius:9px; cursor:help;
  text-align:center; border:1px solid currentColor; background:rgba(255,255,255,.03);}
.atree-head b{display:block; font-size:13px; letter-spacing:.08em; text-transform:uppercase;}
.atree-head span{display:block; font-size:11px; color:#8fb2d8; margin-top:2px;}
.atree-head.dom{background:rgba(255,255,255,.10); box-shadow:0 0 14px currentColor;}
/* grid */
.atree-scroll{flex:1 1 auto; min-height:0; overflow:auto; padding:16px;}
.atree-grid{position:relative; margin:0 auto;}
.atree-pipes{position:absolute; inset:0; overflow:visible; pointer-events:none;}
.atree-node{position:absolute; margin:0; padding:5px 7px; cursor:pointer; text-align:center; z-index:1;
  background:rgba(10,18,34,.96); border:1px solid rgba(120,150,190,.25); border-radius:9px;
  color:#8fb2d8; font:inherit; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
  transition:transform .1s, box-shadow .1s, border-color .1s, opacity .1s;}
.atree-node .g{font-size:14px; line-height:1;}
.atree-node .n{font-size:11px; font-weight:700; line-height:1.15; color:#cfe6ff;}
.atree-node .c{font-size:9px; letter-spacing:.1em; color:#5f7ba3;}
.atree-node:focus{outline:2px solid #40e0ff; outline-offset:2px;}
.atree-node.t-yellow{border-style:dashed;}
.atree-node.t-red{border-width:2px; border-radius:13px;}
.atree-node.dual{border-style:double; border-width:3px;}
.atree-node.s-locked{opacity:.3;}
.atree-node.s-available{opacity:.62;}
.atree-node.s-reachable{box-shadow:0 0 0 1px currentColor, 0 0 16px -2px currentColor;}
.atree-node.s-reachable:hover{transform:translateY(-2px); box-shadow:0 0 0 1px currentColor, 0 0 26px -2px currentColor;}
.atree-node.s-unlocked{box-shadow:0 0 0 2px currentColor, 0 0 22px -4px currentColor;}
.atree-node.s-unlocked .n{color:#ffffff;}
.atree-node.s-blocked{opacity:.34; cursor:not-allowed;}
.atree-node.s-blocked .n{text-decoration:line-through;}
/* tooltip */
.atree-tip{position:fixed; z-index:60; max-width:310px; padding:11px 13px; pointer-events:none; opacity:0;
  background:rgba(8,14,26,.985); border:1px solid rgba(120,150,190,.35); border-radius:10px;
  box-shadow:0 10px 34px rgba(0,0,0,.6); transition:opacity .08s; font-size:12.5px;}
.atree-tip.show{opacity:1;}
.atree-tip h4{margin:0 0 2px; font-size:14.5px; color:#eaf6ff; letter-spacing:.03em;}
.atree-tip .meta{font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:7px;}
.atree-tip .desc{color:#cfe6ff; line-height:1.55; margin-bottom:6px;}
.atree-tip .why{margin-top:8px; padding-top:7px; border-top:1px solid rgba(120,150,190,.2); color:#ff8fa3; line-height:1.55;}
.atree-tip .why b{display:block; color:#ffc857; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:3px;}
.atree-tip .got{margin-top:7px; padding-top:6px; border-top:1px solid rgba(157,255,92,.25); color:#9dff5c;}
.atree-tip table{width:100%; border-collapse:collapse; margin-top:7px; font-size:11.5px;}
.atree-tip td{padding:2px 0; color:#8fb2d8;}
.atree-tip td.v{text-align:right; color:#eaf6ff; font-weight:600;}
.atree-tip .pips{letter-spacing:2px;}
/* confirm */
.atree-confirm{position:absolute; inset:0; z-index:70; display:none; align-items:center; justify-content:center;
  background:rgba(4,8,16,.82); padding:20px;}
.atree-confirm.show{display:flex;}
.atree-confirm .box{max-width:390px; text-align:center; padding:22px 20px; border-radius:12px;
  background:#0c1424; border:1px solid rgba(255,77,109,.45);}
.atree-confirm h3{margin:0 0 8px; color:#eaf6ff; font-size:19px;}
.atree-confirm p{margin:0 0 16px; color:#a8c6e8; font-size:13px; line-height:1.55;}
.atree-confirm .row{display:flex; gap:10px; justify-content:center;}
.atree-confirm button{padding:9px 18px; border-radius:8px; cursor:pointer; font:700 12px/1 inherit;
  letter-spacing:.08em; text-transform:uppercase; border:1px solid rgba(120,150,190,.3); background:transparent; color:#a8c6e8;}
.atree-confirm button.yes{background:#ff4d6d; border-color:#ff4d6d; color:#2a0410;}
@media (max-width:700px){ .atree-scroll{padding:8px;} .atree-hud{padding:7px 10px; gap:7px;} }
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

  /* a node's colour is its archetype's; a convergence wears both */
  function nodeColors(idx, n) {
    if (n.dual) return n.dual.map(a => (idx.archetypes[a] ? idx.archetypes[a].color : '#8fb2d8'));
    if (n.archetype && idx.archetypes[n.archetype]) return [idx.archetypes[n.archetype].color];
    return ['#8fb2d8'];
  }

  function pips(value) {
    const n = RATING_PIPS[value] || 1;
    return '<span class="pips">' + '●'.repeat(n) + '<span style="color:#3a4a5e">' + '●'.repeat(3 - n) + '</span></span>';
  }

  function mount(container, opts) {
    injectCss();
    opts = opts || {};
    let state = opts.state || T.load();
    const onChange = opts.onChange || function () {};

    const rootEl = el('div', 'atree');
    const hud = el('div', 'atree-hud');
    const who = el('div', 'atree-who');
    const pts = el('div', 'atree-pts');
    const spacer = el('div', 'atree-spacer');
    const resetBtn = el('button', 'atree-btn', 'Reset tree');
    const note = el('div', 'atree-note');
    hud.append(who, pts, spacer, resetBtn, note);

    const heads = el('div', 'atree-heads');
    const headInner = el('div', 'atree-headinner');
    heads.appendChild(headInner);

    const scroll = el('div', 'atree-scroll');
    const tip = el('div', 'atree-tip');
    const confirm = el('div', 'atree-confirm',
      '<div class="box"><h3>Reset this ability tree?</h3><p id="atree-confirm-text"></p>' +
      '<div class="row"><button class="yes">Reset</button><button class="no">Cancel</button></div></div>');
    rootEl.append(hud, heads, scroll, tip, confirm);
    container.innerHTML = '';
    container.appendChild(rootEl);

    let idx = null, tiles = {}, segs = null, svg = null, builtFor = null, headEls = [];

    function build() {
      idx = T.activeTree(state);
      builtFor = idx.charId;
      tiles = {}; segs = new Map(); headEls = [];
      scroll.innerHTML = ''; headInner.innerHTML = '';

      const rows = Math.max.apply(null, idx.nodes.map(n => n.row)) + 1;
      const cols = T.COLS || (Math.max.apply(null, idx.nodes.map(n => n.col)) + 1);
      const width = cols * CELL_W;

      headInner.style.width = width + 'px';
      const grid = el('div', 'atree-grid');
      grid.style.width = width + 'px';
      grid.style.height = rows * CELL_H + 'px';
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'atree-pipes');
      svg.setAttribute('width', width);
      svg.setAttribute('height', rows * CELL_H);
      grid.appendChild(svg);
      scroll.appendChild(grid);

      /* one header per archetype, sitting over its column */
      idx.archList.forEach((a, i) => {
        const col = i * 2;                                  // lanes live at columns 0, 2, 4
        const h = el('div', 'atree-head');
        h.style.color = a.color;
        h.style.left = (col * CELL_W + 6) + 'px';
        h.style.width = (CELL_W - 12) + 'px';
        h.innerHTML = '<b>' + a.name + '</b><span><i class="cnt">0</i> allocated</span>';
        h.addEventListener('mouseenter', ev => showArchTip(a, ev.currentTarget));
        h.addEventListener('mouseleave', hideTip);
        h.addEventListener('click', ev => showArchTip(a, ev.currentTarget));   // touch has no hover
        h.tabIndex = 0;
        h.addEventListener('focus', ev => showArchTip(a, ev.currentTarget));
        headInner.appendChild(h);
        headEls.push({ a: a, el: h });
      });
      // keep the headers lined up with the scrolled grid
      scroll.addEventListener('scroll', () => { headInner.style.transform = 'translateX(' + -scroll.scrollLeft + 'px)'; });

      for (const n of idx.nodes) {
        const b = el('button', 'atree-node t-' + n.tier + (n.dual ? ' dual' : ''));
        b.type = 'button';
        b.style.left = (cx(n) - TILE_W / 2) + 'px';
        b.style.top = (cy(n) - TILE_H / 2) + 'px';
        b.style.width = TILE_W + 'px';
        b.style.height = TILE_H + 'px';
        const cols2 = nodeColors(idx, n);
        b.style.color = cols2[0];
        if (cols2.length > 1) {
          b.style.borderColor = 'transparent';
          b.style.backgroundImage = 'linear-gradient(rgba(10,18,34,.96),rgba(10,18,34,.96)), ' +
            'linear-gradient(100deg, ' + cols2[0] + ' 0%, ' + cols2[0] + ' 45%, ' + cols2[1] + ' 55%, ' + cols2[1] + ' 100%)';
          b.style.backgroundOrigin = 'border-box';
          b.style.backgroundClip = 'padding-box, border-box';
        }
        b.innerHTML = '<span class="g">' + (TIER_GLYPH[n.tier] || '◆') + '</span>' +
                      '<span class="n">' + n.name + '</span>' +
                      '<span class="c">' + T.costOf(n) + ' pt' + (T.costOf(n) === 1 ? '' : 's') + '</span>';
        b.addEventListener('click', () => clickNode(n.id));
        b.addEventListener('mouseenter', ev => showTip(n, ev.currentTarget));
        b.addEventListener('focus', ev => showTip(n, ev.currentTarget));
        b.addEventListener('mouseleave', hideTip);
        b.addEventListener('blur', hideTip);
        grid.appendChild(b);
        tiles[n.id] = b;
      }

      /* pipes, deduplicated so shared trunks are one line */
      function addSeg(x1, y1, x2, y2, parent, child) {
        if (x1 === x2 && y1 === y2) return;
        const key = [x1, y1, x2, y2].map(v => Math.round(v)).join(':');
        let s2 = segs.get(key);
        if (!s2) { s2 = { x1, y1, x2, y2, edges: [] }; segs.set(key, s2); }
        s2.edges.push({ parent, child });
      }
      for (const n of idx.nodes) {
        for (const pid of (n.parents || [])) {
          const p = idx.byId[pid];
          if (!p) continue;
          const px = cx(p), py = cy(p), nx = cx(n), ny = cy(n);
          const midY = (py + ny) / 2;
          addSeg(px, py, px, midY, pid, n.id);
          addSeg(px, midY, nx, midY, pid, n.id);
          addSeg(nx, midY, nx, ny, pid, n.id);
        }
      }
      for (const pair of segs) {
        const s2 = pair[1];
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', s2.x1); line.setAttribute('y1', s2.y1);
        line.setAttribute('x2', s2.x2); line.setAttribute('y2', s2.y2);
        line.setAttribute('stroke-width', 4);
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
        s2.path = line;
      }
    }

    const PIPE = { off: 'rgba(120,150,190,.16)', live: 'rgba(120,200,255,.5)', on: '#9dff5c' };
    function paint() {
      const c = state.compiled;
      who.innerHTML = (T.TREES[idx.charId].name || idx.charId.toUpperCase()) + '<small>ability tree</small>';
      pts.innerHTML = c.pointsLeft + ' <small>points left &middot; ' + c.pointsSpent + ' of 86 spent</small>';

      for (const h of headEls) {
        const n = c.archetypeCounts[h.a.id] || 0;
        h.el.querySelector('.cnt').textContent = n;
        h.el.classList.toggle('dom', c.dominant === h.a.id);
      }

      for (const n of idx.nodes) {
        const st = T.nodeStatus(n.id, state);
        const b = tiles[n.id];
        b.className = 'atree-node t-' + n.tier + (n.dual ? ' dual' : '') + ' s-' + st;
        b.setAttribute('aria-pressed', st === 'unlocked' ? 'true' : 'false');
      }

      for (const pair of segs) {
        const s2 = pair[1];
        let best = 'off';
        for (const e of s2.edges) {
          const pOn = T.has(state, e.parent), cOn = T.has(state, e.child);
          if (pOn && cOn) { best = 'on'; break; }
          if (pOn) best = 'live';
        }
        s2.path.setAttribute('stroke', PIPE[best]);
        s2.path.setAttribute('stroke-width', best === 'on' ? 5 : 4);
        s2.path.style.filter = best === 'on' ? 'drop-shadow(0 0 5px rgba(157,255,92,.85))' : 'none';
      }

      note.textContent = state.refunded && state.refunded.length
        ? 'A saved build referenced ' + state.refunded.length + ' ability that no longer exists — those points were refunded.'
        : '';
      if (tipNode && tiles[tipNode.id]) showTip(tipNode, tiles[tipNode.id]);
    }

    let tipNode = null;
    function place(anchor) {
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

    function showArchTip(a, anchor) {
      tipNode = null;
      let html = '<h4 style="color:' + a.color + '">' + a.name + '</h4>';
      html += '<div class="desc">' + a.desc + '</div><table>';
      for (const k of RATING_ORDER) {
        const label = k.charAt(0).toUpperCase() + k.slice(1);
        html += '<tr><td>' + label + '</td><td class="v" style="color:' + a.color + '">' +
                pips(a.ratings[k]) + ' <span style="color:#8fb2d8;font-weight:400">' + a.ratings[k] + '</span></td></tr>';
      }
      html += '</table>';
      tip.innerHTML = html;
      tip.classList.add('show');
      place(anchor);
    }

    function showTip(n, anchor) {
      tipNode = n;
      const unlocked = T.has(state, n.id);
      const check = T.canUnlock(n.id, state);
      const tierLabel = T.TIER_LABEL[n.tier] || n.tier;
      const names = n.dual
        ? n.dual.map(a => idx.archetypes[a].name).join(' + ')
        : (n.archetype ? idx.archetypes[n.archetype].name : 'Core');
      const col = nodeColors(idx, n)[0];

      let html = '<h4>' + n.name + '</h4>';
      html += '<div class="meta" style="color:' + col + '">' + tierLabel + ' &middot; ' + names +
              ' &middot; ' + T.costOf(n) + ' pt' + (T.costOf(n) === 1 ? '' : 's') + '</div>';
      html += '<div class="desc">' + n.desc + '</div>';
      if (n.blocks && n.blocks.length) {
        html += '<div style="color:#ff8fa3">Taking this permanently locks out: ' +
                n.blocks.map(b => (idx.byId[b] ? idx.byId[b].name : b)).join(', ') + '.</div>';
      }
      if (unlocked) html += '<div class="got">Unlocked</div>';
      else if (!check.ok) html += '<div class="why"><b>Requires</b>' + check.reasons.map(r => '<div>' + r + '</div>').join('') + '</div>';
      else html += '<div class="got">Click to unlock</div>';
      tip.innerHTML = html;
      tip.classList.add('show');
      place(anchor);
    }
    function hideTip() { tipNode = null; tip.classList.remove('show'); }

    function clickNode(id) {
      const res = T.unlock(id, state);
      if (res.ok) { paint(); onChange(state); }
      else {
        const b = tiles[id];
        showTip(idx.byId[id], b);
        b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
                   { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 180 });
      }
    }

    resetBtn.addEventListener('click', () => {
      confirm.querySelector('#atree-confirm-text').textContent =
        'Every ability in this character’s tree is cleared and all ' + state.compiled.pointsSpent +
        ' spent points come back. Other characters are untouched.';
      confirm.classList.add('show');
    });
    confirm.querySelector('.no').addEventListener('click', () => confirm.classList.remove('show'));
    confirm.querySelector('.yes').addEventListener('click', () => {
      T.reset(state); state.refunded = null; confirm.classList.remove('show'); paint(); onChange(state);
    });

    build();
    paint();

    return {
      el: rootEl,
      refresh(next) { if (next) state = next; if (state.active !== builtFor) build(); paint(); },
      getState() { return state; },
      destroy() { hideTip(); container.innerHTML = ''; }
    };
  }

  return { mount, CELL_W, CELL_H };
});
