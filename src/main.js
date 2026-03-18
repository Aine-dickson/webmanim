import { EXAMPLES } from './dsl/examples.js';
import { lex } from './dsl/lexer.js';
import { parse } from './dsl/parser.js';
import { Engine } from './runtime/engine.js';
import { Renderer } from './render/renderer.js';
import { evalExpr } from './runtime/evaluator.js';
import { highlight } from './ui/highlight.js';
import { renderAST } from './debug/ast-view.js';
import { setupPointerEvents } from './ui/pointer.js';

let engine = null;
let renderer = null;
let rafId = null;
let simRunning = false;
let lastFrameTime = 0;
let frameCount = 0;
let fpsDisplay = 0;
let showAST = false;

function byId(id) {
  return document.getElementById(id);
}

function log(msg) {
  byId('log').textContent = msg;
}

function setStatus(msg, color = 'var(--accent)') {
  const el = byId('statusdot');
  el.textContent = '● ' + msg;
  el.style.color = color;
}

function onEdit() {
  const src = byId('ed').value;
  byId('hl').innerHTML = highlight(src);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showEditorPanel() {
  showAST = false;
  byId('btn-ast').classList.remove('active');
  byId('astbox').classList.remove('on');
  document.querySelector('.ewrap').style.display = 'block';
}

function getErrorLocation(err) {
  if (err?.token?.line && err?.token?.col) {
    return { line: err.token.line, col: err.token.col };
  }

  const msg = String(err?.message || '');
  const m = msg.match(/line\s+(\d+)\s*,?\s*col\s+(\d+)/i);
  if (!m) return null;
  return { line: Number(m[1]), col: Number(m[2]) };
}

function lineColToIndex(src, line, col) {
  const safeLine = Math.max(1, line | 0);
  const safeCol = Math.max(1, col | 0);
  const lines = src.split('\n');
  const lineIdx = Math.min(safeLine - 1, Math.max(0, lines.length - 1));
  let idx = 0;
  for (let i = 0; i < lineIdx; i += 1) idx += lines[i].length + 1;
  const colIdx = Math.min(safeCol - 1, lines[lineIdx].length);
  return idx + colIdx;
}

function jumpToError(line, col) {
  const ed = byId('ed');
  showEditorPanel();
  const idx = lineColToIndex(ed.value, line, col);
  ed.focus();
  ed.setSelectionRange(idx, idx);

  const style = getComputedStyle(ed);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const targetTop = Math.max(0, (line - 2) * lineHeight);
  ed.scrollTop = targetTop;
  byId('hl').scrollTop = ed.scrollTop;
  byId('hl').scrollLeft = ed.scrollLeft;
}

function renderErrorBar(err) {
  const bar = byId('errbar');
  const loc = getErrorLocation(err);
  const msg = escapeHtml(err?.message || 'Unknown error');

  if (loc) {
    bar.innerHTML = `
      <span>⚠ ${msg}</span>
      <button id="jump-err-btn" class="cbtn" style="margin-left:10px;padding:2px 8px;font-size:0.66rem">jump to line ${loc.line}:${loc.col}</button>
    `;
    const jumpBtn = byId('jump-err-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => jumpToError(loc.line, loc.col));
    }
  } else {
    bar.textContent = '⚠ ' + (err?.message || 'Unknown error');
  }

  bar.classList.add('on');
}

function renderAstJson(ast) {
  return '<pre style="font-size:0.7rem;line-height:1.6;color:var(--text)">' + JSON.stringify(ast, null, 2)
    .replace(/("type":\s*"[^"]+")/g, '<span style="color:var(--kw)">$1</span>')
    .replace(/("val":\s*-?[\d.]+)/g, '<span style="color:var(--num)">$1</span>')
    .replace(/("fn":\s*"[^"]+")/g, '<span style="color:var(--fn)">$1</span>') + '</pre>';
}

function showAstPanel() {
  showAST = true;
  byId('btn-ast').classList.add('active');
  byId('astbox').classList.add('on');
  document.querySelector('.ewrap').style.display = 'none';
}

function showPartialAst(err) {
  if (!err || !err.partialAst) return;
  const header = `<div style="margin-bottom:8px;color:#ff9090;font-size:0.72rem">partial AST until parse stopped at line ${err.token?.line ?? '?'} col ${err.token?.col ?? '?'}.</div>`;
  byId('astbox').innerHTML = header + renderAstJson(err.partialAst);
  showAstPanel();
}

function buildControls(sceneAST, eng) {
  const panel = byId('ctrls');
  panel.innerHTML = '';
  if (!sceneAST.control) return;

  for (const stmt of sceneAST.control.stmts) {
    if (stmt.kind === 'slider') {
      const lo = evalExpr(stmt.lo, {});
      const hi = evalExpr(stmt.hi, {});
      const def = stmt.opts.default ? evalExpr(stmt.opts.default, {}) : lo;
      const lbl = stmt.opts.label ? evalExpr(stmt.opts.label, {}) : stmt.target;
      const valId = 'cv-' + stmt.target.replace('.', '_');
      const item = document.createElement('div');
      item.className = 'ci';
      item.innerHTML = `<div class="clbl">${lbl} <span id="${valId}">${def.toFixed(2)}</span></div>
<input type="range" class="cslider" min="${lo}" max="${hi}" step="${(hi - lo) / 200}" value="${def}">`;

      item.querySelector('input').oninput = function onInput() {
        const v = parseFloat(this.value);
        byId(valId).textContent = v.toFixed(2);
        eng.setParam(stmt.target, v);
      };

      panel.appendChild(item);
      eng.setParam(stmt.target, def);
      continue;
    }

    if (stmt.kind === 'button') {
      const btn = document.createElement('button');
      btn.className = 'cbtn';
      btn.textContent = stmt.label;
      btn.onclick = () => {
        eng.applyControlAssigns(stmt.assigns);
        if (stmt.label.toLowerCase().includes('reset')) {
          for (const k of Object.keys(eng.trails)) eng.trails[k] = [];
          eng.time = 0;
        }
      };
      panel.appendChild(btn);
    }
  }
}

function rafLoop() {
  if (!simRunning || !engine || !renderer) return;

  const now = performance.now();
  const wall = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  frameCount += 1;

  if (frameCount % 30 === 0) {
    fpsDisplay = Math.round(1 / wall);
    byId('fps').textContent = fpsDisplay + ' fps';
  }

  const stepsPerFrame = 4;
  for (let i = 0; i < stepsPerFrame; i += 1) engine.tick();

  renderer.draw();
  byId('ptime').textContent = engine.time.toFixed(1) + 's';
  const prog = Math.min(100, (engine.time / 60) * 100);
  byId('pfill').style.width = prog + '%';

  rafId = requestAnimationFrame(rafLoop);
}

function compile() {
  const src = byId('ed').value;
  byId('errbar').classList.remove('on');
  byId('errbar').textContent = '';
  setStatus('parsing…', 'var(--accent4)');

  // Stop any previous run first so parse failures do not keep stale animation alive.
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  simRunning = false;
  byId('pbtn').textContent = '▶';

  try {
    const tokens = lex(src);
    const ast = parse(tokens);

    if (!ast.scene) throw new Error('No scene block found');

    if (showAST) byId('astbox').innerHTML = renderAST(ast);

    engine = new Engine(ast);
    const cv = byId('cv');
    renderer = new Renderer(cv, engine, ast.scene);

    byId('stitle').textContent = ast.scene.title;
    buildControls(ast.scene, engine);

    setStatus('running', 'var(--accent)');
    log(`✓ compiled — ${ast.objects.length} object type(s), ${Object.keys(engine.instances).length} instance(s)`);

    simRunning = true;
    lastFrameTime = performance.now();
    frameCount = 0;
    rafLoop();
  } catch (e) {
    renderErrorBar(e);
    showPartialAst(e);
    setStatus('error', '#ff8080');
    log('Parse error: ' + e.message);
    console.error(e);
  }
}

function toggleSim() {
  simRunning = !simRunning;
  byId('pbtn').textContent = simRunning ? '⏸' : '▶';
  if (simRunning) {
    lastFrameTime = performance.now();
    rafLoop();
  }
}

function loadEx(name, btn) {
  document.querySelectorAll('.ex').forEach((b) => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  byId('ed').value = EXAMPLES[name];
  onEdit();
  compile();
}

function toggleAST() {
  showAST = !showAST;
  const btn = byId('btn-ast');
  const box = byId('astbox');
  const ewrap = document.querySelector('.ewrap');

  btn.classList.toggle('active', showAST);
  box.classList.toggle('on', showAST);
  ewrap.style.display = showAST ? 'none' : 'block';

  if (showAST) {
    try {
      const tokens = lex(byId('ed').value);
      const ast = parse(tokens);
      box.innerHTML = renderAstJson(ast);
    } catch (e) {
      if (e.partialAst) {
        const header = `<div style="margin-bottom:8px;color:#ff9090;font-size:0.72rem">parse stopped at line ${e.token?.line ?? '?'} col ${e.token?.col ?? '?'}. showing partial AST.</div>`;
        box.innerHTML = header + renderAstJson(e.partialAst);
      } else {
        box.innerHTML = '<span style="color:#ff8080">' + e.message + '</span>';
      }
    }
  }
}

function init() {
  byId('ed').addEventListener('input', onEdit);
  byId('ed').addEventListener('scroll', function onScroll() {
    byId('hl').scrollTop = this.scrollTop;
    byId('hl').scrollLeft = this.scrollLeft;
  });

  byId('btn-ast').addEventListener('click', toggleAST);
  byId('pbtn').addEventListener('click', toggleSim);

  const cv = byId('cv');
  setupPointerEvents(cv, () => engine);

  document.querySelectorAll('.ex').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-example');
      loadEx(key, btn);
    });
  });

  byId('run-btn').addEventListener('click', compile);

  byId('ed').value = EXAMPLES.pendulum;
  onEdit();
  setTimeout(compile, 200);
}

init();
