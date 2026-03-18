import { evalExpr } from '../runtime/evaluator.js';

export function canvasCoords(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width / r.width;
  const sy = canvas.height / r.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return [(clientX - r.left) * sx, (clientY - r.top) * sy];
}

export function hitTest(engine, pos) {
  for (const [name, inst] of Object.entries(engine.instances)) {
    const def = engine.objectDefs[inst.typeName];
    if (!def || !def.shape) continue;
    const ipos = inst.state.pos;
    if (!ipos) continue;
    const dx = pos[0] - ipos[0];
    const dy = pos[1] - ipos[1];
    const r = def.shape.props.r ? evalExpr(def.shape.props.r, inst.state) : 14;
    const hr = (typeof r === 'number' ? r : 14) + 10;
    if (dx * dx + dy * dy < hr * hr) return name;
  }
  return null;
}

export function setupPointerEvents(canvas, engineGetter) {
  let dragging = null;
  let lastMousePos = null;
  let lastMouseTime = 0;
  let mouseVelTrack = [0, 0];

  canvas.onmousedown = canvas.ontouchstart = (e) => {
    e.preventDefault();
    const engine = engineGetter();
    if (!engine) return;
    const pos = canvasCoords(e, canvas);
    const name = hitTest(engine, pos);
    if (!name) return;
    dragging = name;
    lastMousePos = pos;
    lastMouseTime = performance.now();
  };

  canvas.onmousemove = canvas.ontouchmove = (e) => {
    e.preventDefault();
    const engine = engineGetter();
    if (!engine || !dragging) return;
    const pos = canvasCoords(e, canvas);
    const now = performance.now();
    const dt = (now - lastMouseTime) / 1000 || 0.016;
    if (lastMousePos) {
      mouseVelTrack = [(pos[0] - lastMousePos[0]) / dt, (pos[1] - lastMousePos[1]) / dt];
    }
    lastMousePos = pos;
    lastMouseTime = now;
    engine.onDrag(dragging, pos);
  };

  canvas.onmouseup = canvas.ontouchend = () => {
    const engine = engineGetter();
    if (!engine || !dragging) return;
    engine.onRelease(dragging, mouseVelTrack);
    dragging = null;
  };

  canvas.onmouseleave = () => {
    const engine = engineGetter();
    if (!engine || !dragging) return;
    engine.onRelease(dragging, [0, 0]);
    dragging = null;
  };
}
