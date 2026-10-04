/* CCPP-I explainers: shared behaviour and widgets. No dependencies. */
(function () {
  'use strict';
  const C = window.Course = {};

  /* ---------- helpers ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  C.esc = esc;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  C.el = el;
  const $ = (sel, root) => (root || document).querySelector(sel);
  C.$ = $;

  /* Python repr for JS values (strings quoted with '), used by widgets. */
  function repr(v) {
    if (v === null) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']';
    if (v && v.__tuple) return '(' + v.items.map(repr).join(', ') + (v.items.length === 1 ? ',' : '') + ')';
    if (typeof v === 'object') return '{' + Object.keys(v).map(k => repr(k) + ': ' + repr(v[k])).join(', ') + '}';
    return String(v);
  }
  C.repr = repr;
  C.tuple = (...items) => ({ __tuple: true, items });

  /* ---------- Python syntax highlighting ---------- */
  const KW = /^(def|return|if|elif|else|for|while|in|not|and|or|is|del|global|with|as|import|from|class|pass|break|continue|None|True|False|lambda|try|except|raise|yield)$/;
  const BI = /^(print|len|range|enumerate|type|str|int|float|list|dict|tuple|sorted|sum|open|input|zip|set|bool|min|max|abs|round|exit|isinstance|super|staticmethod)$/;
  const TOK = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[fFrRbB]?'(?:\\.|[^'\\\n])*'|[fFrRbB]?"(?:\\.|[^"\\\n])*")|(\b\d+(?:\.\d*)?(?:[eE][+-]?\d+)?\b|\b\.\d+\b)|([A-Za-z_]\w*)/g;
  function hl(code) {
    let out = '', last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(code))) {
      out += esc(code.slice(last, m.index));
      const t = m[0];
      if (m[1]) out += '<span class="cmt">' + esc(t) + '</span>';
      else if (m[2]) out += '<span class="str">' + esc(t) + '</span>';
      else if (m[3]) out += '<span class="num">' + esc(t) + '</span>';
      else if (KW.test(t)) out += '<span class="kw">' + esc(t) + '</span>';
      else if (BI.test(t)) out += '<span class="fn">' + esc(t) + '</span>';
      else out += esc(t);
      last = m.index + t.length;
    }
    return out + esc(code.slice(last));
  }
  C.hl = hl;

  /* <pre class="code">...</pre>: highlight in place. data-lines="1" adds line numbers and per-line spans. */
  function codeBlock(pre, code, numbered) {
    const lines = code.replace(/\n$/, '').split('\n');
    pre.innerHTML = lines.map((l, i) =>
      '<span class="line" data-l="' + (i + 1) + '">' + (numbered ? '<span class="ln">' + (i + 1) + '</span>' : '') + (hl(l) || ' ') + '</span>'
    ).join('');
  }
  C.codeBlock = codeBlock;

  /* ---------- Tracer: step through code with variables and output ----------
     spec = { code, steps: [{ l: line | [lines], v: {name: 'repr'} (global frame) | f: [{n, v, ret}], o: 'output so far', note }] } */
  C.tracer = function (host, spec) {
    host.classList.add('tracer');
    const pre = el('pre', 'code');
    codeBlock(pre, spec.code, true);
    const side = el('div', 'side');
    const state = el('div', 'state');
    const out = el('div', 'out');
    const loop = spec.items ? el('div', 'state loopcells') : null;
    if (loop) side.append(loop);
    side.append(state, out);
    function renderLoop(cur) {
      loop.innerHTML = '<span class="label">' + esc(spec.itemsName || 'loop over') + '</span>';
      const row = el('div', 'cells');
      spec.items.forEach((it, k) => {
        const c = el('div', 'cell', esc(it));
        if (cur === 'end' || (typeof cur === 'number' && k < cur)) c.classList.add('dim');
        if (k === cur) c.classList.add('sel');
        row.append(c);
      });
      loop.append(row);
    }
    const ctl = el('div', 'ctl');
    const bFirst = el('button', 'btn', '⏮'), bPrev = el('button', 'btn', '◀ back'), bNext = el('button', 'btn', 'step ▶'), bPlay = el('button', 'btn', '▶▶ play');
    const pos = el('span', 'pos'), note = el('div', 'note');
    ctl.append(bFirst, bPrev, bNext, bPlay, pos, note);
    const left = el('div', 'left');
    left.append(pre, ctl);
    host.append(left, side);

    let i = -1, prev = null, timer = null;
    function framesOf(s) { return s.f ? s.f : [{ n: 'global', v: s.v || {} }]; }
    function render() {
      pre.querySelectorAll('.line.cur').forEach(x => x.classList.remove('cur'));
      state.innerHTML = '';
      out.innerHTML = '<span class="label">output</span>';
      if (loop) renderLoop(i < 0 ? null : spec.steps[i].cur);
      if (i < 0) {
        state.innerHTML = '<span class="label">variables</span><div class="empty">nothing yet: press step</div>';
        pos.textContent = '0 / ' + spec.steps.length;
        note.textContent = '';
      } else {
        const s = spec.steps[i];
        [].concat(s.l || []).forEach(l => { const q = pre.querySelector('.line[data-l="' + l + '"]'); if (q) q.classList.add('cur'); });
        const frames = framesOf(s), pframes = prev ? framesOf(prev) : [];
        state.innerHTML = '<span class="label">variables</span>';
        frames.forEach((fr, k) => {
          const d = el('div', 'frame' + (fr.n === 'global' ? '' : ' fn'));
          if (fr.n !== 'global') d.append(el('div', 'fname', esc(fr.n)));
          const vs = el('div', 'vars');
          const pf = pframes[k];
          Object.keys(fr.v || {}).forEach(name => {
            const changed = !pf || pf.n !== fr.n || pf.v[name] !== fr.v[name];
            vs.append(el('span', 'var' + (changed ? ' changed' : ''), esc(name) + ' = ' + esc(fr.v[name])));
          });
          if (fr.ret !== undefined) vs.append(el('span', 'var ret changed', 'return ' + esc(fr.ret)));
          if (!vs.children.length) vs.append(el('span', 'empty', '—'));
          d.append(vs);
          state.append(d);
        });
        out.append(document.createTextNode(s.o || ''));
        if (s.e) out.append(el('span', 'err', esc(s.e)));
        pos.textContent = (i + 1) + ' / ' + spec.steps.length;
        note.textContent = s.note || '';
      }
      bPrev.disabled = i < 0; bNext.disabled = i >= spec.steps.length - 1;
    }
    function go(n) { prev = i >= 0 ? spec.steps[i] : null; i = Math.max(-1, Math.min(spec.steps.length - 1, n)); render(); }
    function stop() { if (timer) { clearInterval(timer); timer = null; bPlay.textContent = '▶▶ play'; } }
    bFirst.onclick = () => { stop(); go(-1); };
    bPrev.onclick = () => { stop(); go(i - 1); };
    bNext.onclick = () => { stop(); go(i + 1); };
    bPlay.onclick = () => {
      if (timer) return stop();
      if (i >= spec.steps.length - 1) go(-1);
      bPlay.textContent = '❚❚ pause';
      timer = setInterval(() => { if (i >= spec.steps.length - 1) stop(); else go(i + 1); }, spec.speed || 900);
    };
    render();
    return { go };
  };

  /* ---------- Slicer: indexing and slicing of a string or list ---------- */
  function sliceIndices(n, start, stop, step) {
    let lower, upper;
    if (step > 0) { lower = 0; upper = n; } else { lower = -1; upper = n - 1; }
    const adj = (x, dflt) => {
      if (x == null) return dflt;
      if (x < 0) { x += n; if (x < lower) x = lower; } else if (x > upper) x = upper;
      return x;
    };
    start = adj(start, step < 0 ? upper : lower);
    stop = adj(stop, step < 0 ? lower : upper);
    const idx = [];
    if (step > 0) for (let i = start; i < stop; i += step) idx.push(i);
    else for (let i = start; i > stop; i += step) idx.push(i);
    return idx;
  }
  C.sliceIndices = sliceIndices;

  C.slicer = function (host, spec) {
    const items = spec.items, n = items.length, name = spec.name, isStr = spec.kind === 'str';
    const fmt = v => isStr ? esc(v) : esc(repr(v));
    const wrap = el('div', 'viz');
    const cells = el('div', 'cells');
    const ctl = el('div', 'controls');
    const seg = el('div', 'seg');
    const bIdx = el('button', 'on', 'one index'), bSl = el('button', '', 'slice');
    seg.append(bIdx, bSl);
    const idxLab = el('label', '', 'index <input type="range" min="' + (-n - 1) + '" max="' + n + '" value="0"> <output></output>');
    const stLab = el('label', 'opt', '<input type="checkbox" checked title="untick to leave start out"> start <input type="range" min="' + (-n) + '" max="' + n + '" value="0"> <output></output>');
    const spLab = el('label', 'opt', '<input type="checkbox" checked title="untick to leave stop out"> stop <input type="range" min="' + (-n) + '" max="' + n + '" value="' + Math.min(2, n) + '"> <output></output>');
    const stepLab = el('label', '', 'step <input type="range" min="-3" max="3" value="1"> <output></output>');
    ctl.append(seg, idxLab, stLab, spLab, stepLab);
    const res = el('div', 'result');
    wrap.append(cells, ctl, res);
    host.append(wrap);

    const colIn = [];
    items.forEach((it, i) => {
      const col = el('div', 'cellcol');
      const top = el('div', 'idx', String(i)), cell = el('div', 'cell', fmt(it)), bot = el('div', 'idx neg', String(i - n));
      col.append(top, cell, bot); cells.append(col); colIn.push({ top, cell, bot });
    });
    const ghost = el('div', 'cellcol'); ghost.append(el('div', 'idx', String(n)), el('div', 'cell ghost', '?'), el('div', 'idx neg', ''));
    cells.append(ghost);

    let mode = 'idx';
    const r = lab => lab.querySelector('input[type=range]'), o = lab => lab.querySelector('output'), ck = lab => lab.querySelector('input[type=checkbox]');
    function update() {
      [stLab, spLab, stepLab].forEach(l => l.style.display = mode === 'sl' ? '' : 'none');
      idxLab.style.display = mode === 'idx' ? '' : 'none';
      colIn.forEach(c => { c.cell.className = 'cell'; c.cell.innerHTML = fmt(items[colIn.indexOf(c)]); c.top.className = 'idx'; c.bot.className = 'idx neg'; });
      ghost.style.visibility = 'hidden';
      if (mode === 'idx') {
        const k = +r(idxLab).value; o(idxLab).textContent = k;
        const real = k < 0 ? k + n : k;
        if (real < 0 || real >= n) {
          ghost.style.visibility = ''; ghost.querySelector('.cell').classList.add('bad');
          ghost.querySelector('.idx').textContent = k;
          res.innerHTML = esc(name + '[' + k + ']') + '<span class="arrow">→</span><span class="err">IndexError: ' + (isStr ? 'string' : 'list') + ' index out of range</span>';
        } else {
          colIn[real].cell.classList.add('sel');
          (k < 0 ? colIn[real].bot : colIn[real].top).classList.add('hot');
          res.innerHTML = esc(name + '[' + k + ']') + '<span class="arrow">→</span>' + esc(repr(items[real]));
        }
      } else {
        const st = ck(stLab).checked ? +r(stLab).value : null, sp = ck(spLab).checked ? +r(spLab).value : null;
        [stLab, spLab].forEach(l => { l.classList.toggle('off', !ck(l).checked); r(l).disabled = !ck(l).checked; });
        let step = +r(stepLab).value; if (step === 0) { step = 1; r(stepLab).value = 1; }
        o(stLab).textContent = r(stLab).value; o(spLab).textContent = r(spLab).value; o(stepLab).textContent = step;
        const idx = sliceIndices(n, st, sp, step);
        idx.forEach((i, ord) => { colIn[i].cell.classList.add('sel'); if (step !== 1) colIn[i].cell.append(el('span', 'ord', String(ord + 1))); });
        if (st != null && st >= 0 && st < n) colIn[st].top.classList.add('hot');
        if (st != null && st < 0 && st >= -n) colIn[st + n].bot.classList.add('hot');
        if (sp != null && sp >= 0 && sp < n) colIn[sp].top.classList.add('hot');
        if (sp != null && sp < 0 && sp >= -n) colIn[sp + n].bot.classList.add('hot');
        if (sp != null && sp === n) { ghost.style.visibility = ''; ghost.querySelector('.idx').classList.add('hot'); }
        const txt = name + '[' + (st == null ? '' : st) + ':' + (sp == null ? '' : sp) + (step === 1 ? '' : ':' + step) + ']';
        const val = idx.map(i => items[i]);
        res.innerHTML = esc(txt) + '<span class="arrow">→</span>' + esc(isStr ? repr(val.join('')) : repr(val));
      }
    }
    bIdx.onclick = () => { mode = 'idx'; bIdx.classList.add('on'); bSl.classList.remove('on'); update(); };
    bSl.onclick = () => { mode = 'sl'; bSl.classList.add('on'); bIdx.classList.remove('on'); update(); };
    ctl.querySelectorAll('input').forEach(x => x.addEventListener('input', update));
    update();
  };

  /* ---------- Ops: a sequence of statements applied to a state, click to apply up to that one ----------
     spec = { init: () => state, render: (state, view, info) => void, ops: [{code, apply: (state) => output|undefined}] } */
  C.ops = function (host, spec) {
    const wrap = el('div', 'viz cols');
    const list = el('div', 'ops');
    const right = el('div');
    const view = el('div');
    const out = el('div', 'out', '<span class="label">output</span>');
    right.append(view, out);
    wrap.append(list, right);
    host.append(wrap);
    let cur = -1;
    const buttons = spec.ops.map((op, k) => {
      const b = el('button', '', hl(op.code));
      b.onclick = () => run(k === cur ? -1 : k);   // second click on the selected statement undoes everything
      list.append(b);
      return b;
    });
    function run(k) {
      cur = k;
      let st = spec.init(), info = {}, o = '';
      for (let j = 0; j <= k; j++) { info = {}; const r = spec.ops[j].apply(st, info); if (j === k) o = r == null ? '' : r; }
      buttons.forEach((b, j) => { b.classList.toggle('on', j === k); b.classList.toggle('done', j < k); });
      view.innerHTML = '';
      spec.render(st, view, k >= 0 ? info : {});
      out.innerHTML = '<span class="label">output</span>';
      if (typeof o === 'string' && o.startsWith('!')) out.append(el('span', 'err', esc(o.slice(1)))); else out.append(document.createTextNode(o));
    }
    run(-1);
  };

  /* render a list as cells, marking indices given in info.sel / info.new */
  C.listCells = function (items, info, name) {
    info = info || {};
    const w = el('div', 'cells');
    w.append(el('span', 'bracket', '['));
    items.forEach((it, i) => {
      const col = el('div', 'cellcol');
      const c = el('div', 'cell', esc(repr(it)));
      if (info.sel && info.sel.includes(i)) c.classList.add('sel');
      if (info.new && info.new.includes(i)) c.classList.add('new');
      col.append(el('div', 'idx', String(i)), c, el('div', 'idx neg', ''));
      w.append(col);
    });
    w.append(el('span', 'bracket', ']'));
    if (name) { const d = el('div'); d.append(el('div', 'result muted', esc(name) + ' ='), w); return d; }
    return w;
  };

  /* ---------- Object diagram: names -> objects, stepwise ----------
     spec = { steps: [{ code, names: {a: 'o1'}, objs: {o1: {type:'list', text:'[1, 2]'}}, changed: ['o1'], out }] } */
  C.objdiag = function (host, spec) {
    const wrap = el('div', 'viz cols');
    const list = el('div', 'ops');
    const right = el('div');
    const diag = el('div', 'objdiag');
    const names = el('div', 'names'), objs = el('div', 'objs');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    diag.append(names, objs, svg);
    const out = el('div', 'out', '<span class="label">output</span>');
    right.append(diag, out);
    wrap.append(list, right);
    host.append(wrap);
    const buttons = spec.steps.map((s, k) => { const b = el('button', '', hl(s.code)); b.onclick = () => show(k); list.append(b); return b; });
    function show(k) {
      const s = spec.steps[k];
      buttons.forEach((b, j) => { b.classList.toggle('on', j === k); b.classList.toggle('done', j < k); });
      names.innerHTML = ''; objs.innerHTML = ''; svg.innerHTML = '';
      const nameEls = {}, objEls = {};
      Object.keys(s.objs).forEach(id => { const o = el('div', 'obj' + ((s.changed || []).includes(id) ? ' changed' : ''), '<span class="otype">' + esc(s.objs[id].type) + '</span>' + esc(s.objs[id].text)); objs.append(o); objEls[id] = o; });
      Object.keys(s.names).forEach(nm => { const d = el('div', 'name', esc(nm)); names.append(d); nameEls[nm] = d; });
      out.innerHTML = '<span class="label">output</span>' + esc(s.out || '');
      requestAnimationFrame(() => {
        const R = diag.getBoundingClientRect();
        Object.keys(s.names).forEach(nm => {
          const a = nameEls[nm].getBoundingClientRect(), b = objEls[s.names[nm]].getBoundingClientRect();
          const x1 = a.right - R.left, y1 = a.top + a.height / 2 - R.top, x2 = b.left - R.left, y2 = b.top + b.height / 2 - R.top;
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2 - 4},${y2}`);
          if ((s.hot || []).includes(nm)) p.classList.add('hot');
          svg.append(p);
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', x2 - 3); dot.setAttribute('cy', y2); dot.setAttribute('r', 3); dot.setAttribute('fill', 'var(--muted)');
          svg.append(dot);
        });
      });
    }
    show(0);
    window.addEventListener('resize', () => { const k = buttons.findIndex(b => b.classList.contains('on')); if (k >= 0) show(k); });
  };

  /* ---------- Binder: how call arguments land on parameters ----------
     spec = { name, params: [{n, def}], star, kw, calls: [{text, pos: [], kw: {}}], body: (bound) => output } */
  C.binder = function (host, spec) {
    const wrap = el('div', 'viz cols binder');
    const list = el('div', 'ops');
    const right = el('div');
    const sig = el('div', 'result muted');
    const params = el('div', 'params');
    const out = el('div', 'out', '<span class="label">output</span>');
    right.append(sig, params, out);
    wrap.append(list, right);
    host.append(wrap);
    sig.innerHTML = hl('def ' + spec.name + '(' + spec.params.map(p => p.n + (p.def !== undefined ? '=' + p.def : '')).concat(spec.star ? ['*' + spec.star] : [], spec.kw ? ['**' + spec.kw] : []).join(', ') + '):');
    const buttons = spec.calls.map((c, k) => { const b = el('button', '', hl(c.text)); b.onclick = () => show(k); list.append(b); return b; });
    function show(k) {
      const c = spec.calls[k];
      buttons.forEach((b, j) => b.classList.toggle('on', j === k));
      params.innerHTML = '';
      const bound = {}, src = {};
      let err = null;
      const pos = c.pos.slice();
      spec.params.forEach(p => { if (pos.length) { bound[p.n] = pos.shift(); src[p.n] = 'positional'; } });
      const extra = [];
      if (pos.length) { if (spec.star) extra.push(...pos); else err = 'TypeError: ' + spec.name + '() takes ' + spec.params.length + ' positional arguments but ' + c.pos.length + ' were given'; }
      const kwrest = {};
      Object.keys(c.kw || {}).forEach(k2 => {
        if (spec.params.some(p => p.n === k2)) { if (bound[k2] !== undefined) err = err || "TypeError: " + spec.name + "() got multiple values for argument '" + k2 + "'"; bound[k2] = c.kw[k2]; src[k2] = 'keyword'; }
        else if (spec.kw) kwrest[k2] = c.kw[k2];
        else err = err || "TypeError: " + spec.name + "() got an unexpected keyword argument '" + k2 + "'";
      });
      spec.params.forEach(p => { if (bound[p.n] === undefined) { if (p.def !== undefined) { bound[p.n] = p.def; src[p.n] = 'default'; } else err = err || "TypeError: " + spec.name + "() missing 1 required positional argument: '" + p.n + "'"; } });
      spec.params.forEach(p => {
        const d = el('div', 'param ' + (src[p.n] === 'default' ? 'def' : src[p.n] ? 'hot' : 'miss'));
        d.innerHTML = '<span class="pn">' + (src[p.n] || 'missing') + '</span>' + esc(p.n) + ' = ' + esc(bound[p.n] === undefined ? '?' : bound[p.n]);
        params.append(d);
      });
      if (spec.star) params.append(el('div', 'param ' + (extra.length ? 'hot' : 'def'), '<span class="pn">extra positional</span>' + esc(spec.star) + ' = (' + extra.join(', ') + (extra.length === 1 ? ',' : '') + ')'));
      if (spec.kw) params.append(el('div', 'param ' + (Object.keys(kwrest).length ? 'hot' : 'def'), '<span class="pn">extra keyword</span>' + esc(spec.kw) + ' = {' + Object.keys(kwrest).map(k2 => "'" + k2 + "': " + kwrest[k2]).join(', ') + '}'));
      out.innerHTML = '<span class="label">output</span>';
      if (err) out.append(el('span', 'err', esc(err)));
      else out.append(document.createTextNode(spec.body(bound, extra, kwrest)));
    }
    show(0);
  };

  /* ---------- Hover groups: elements with class grp-N highlight together ---------- */
  function hoverGroups(root) {
    root.querySelectorAll('[data-g]').forEach(e => {
      e.classList.add('grp');
      e.addEventListener('mouseenter', () => root.querySelectorAll('[data-g]').forEach(x => { x.classList.toggle('hot', x.dataset.g === e.dataset.g); x.classList.toggle('cold', x.dataset.g !== e.dataset.g); }));
      e.addEventListener('mouseleave', () => root.querySelectorAll('[data-g]').forEach(x => x.classList.remove('hot', 'cold')));
    });
  }

  /* ---------- page setup: theme, highlighting, toc, keys ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('pre.code[data-src]').forEach(pre => { const n = pre.hasAttribute('data-lines'); codeBlock(pre, pre.textContent.replace(/^\n/, ''), n); });
    document.querySelectorAll('pre.code:not([data-src])').forEach(pre => { if (!pre.children.length) pre.innerHTML = hl(pre.textContent.replace(/^\n/, '')); });
    document.querySelectorAll('.reveal').forEach(r => r.addEventListener('click', () => r.classList.toggle('open')));
    hoverGroups(document);

    const secs = [...document.querySelectorAll('section[id]')];
    // section dropdown in the toolbar: lists numbered sections, follows the scroll position
    const sel = $('#nav');
    if (sel) {
      let n = 0;
      secs.forEach(sc => {
        const h = sc.querySelector('h2');
        const o = document.createElement('option');
        o.value = sc.id;
        const name = sc.dataset.nav || h.textContent;
        o.textContent = sc.classList.contains('pause') ? '\u2003⏸ ' + name : (++n) + '. ' + name;
        sel.append(o);
      });
      sel.onchange = () => { document.getElementById(sel.value).scrollIntoView(); sel.blur(); };
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) sel.value = e.target.id; });
      }, { rootMargin: '-5% 0px -75% 0px' });
      secs.forEach(sc => io.observe(sc));
    }
    // keyboard: J/K or arrows jump between sections
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea')) return;
      const next = e.key === 'j' || e.key === 'ArrowRight' || e.key === 'PageDown', prev = e.key === 'k' || e.key === 'ArrowLeft' || e.key === 'PageUp';
      if (!next && !prev) return;
      e.preventDefault();
      const y = window.scrollY + 20;
      let k = secs.findIndex(s => s.offsetTop > y);
      if (prev) k = secs.filter(s => s.offsetTop < y - 10).length - 1;
      if (k >= 0 && k < secs.length) secs[k].scrollIntoView({ behavior: 'smooth' });
    });
    // theme
    const root = document.documentElement, button = $('#theme');
    if (button) {
      const order = ['auto', 'light', 'dark'];
      let current = 'auto';
      try { current = localStorage.getItem('theme') || 'auto'; } catch (e) {}
      if (order.indexOf(current) < 0) current = 'auto';
      const apply = m => { if (m === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', m); button.textContent = 'theme: ' + m; };
      apply(current);
      button.onclick = () => { current = order[(order.indexOf(current) + 1) % 3]; apply(current); try { localStorage.setItem('theme', current); } catch (e) {} };
    }
    // font size: A- / A+ change the root size (everything is in rem)
    const fsOut = $('#fs-size');
    if (fsOut) {
      let px = 19;
      try { px = +localStorage.getItem('fontpx') || 19; } catch (e) {}
      const applyFs = () => { root.style.fontSize = px + 'px'; fsOut.textContent = px + 'px'; try { localStorage.setItem('fontpx', px); } catch (e) {} };
      $('#fs-minus').onclick = () => { px = Math.max(13, px - 1); applyFs(); };
      $('#fs-plus').onclick = () => { px = Math.min(32, px + 1); applyFs(); };
      applyFs();
    }
    if (C.init) C.init();
  });
})();
