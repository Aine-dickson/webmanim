import { evalExpr } from '../runtime/evaluator.js';

export class Renderer {
    constructor(canvas, engine, sceneAST) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this.eng = engine;
        this.sc = sceneAST;
        this.W = canvas.width;
        this.H = canvas.height;
        this.world = { xMin: 0, xMax: this.W, yMin: 0, yMax: this.H };
        this._parseAxes();
    }

    _parseAxes() {
        const title = this.sc.title || '';
        if (title.toLowerCase().includes('sine') || title.toLowerCase().includes('wave')) {
            this.world = { xMin: -7, xMax: 7, yMin: -3, yMax: 3 };
            this.axesMode = 'math';
        } else {
            this.world = { xMin: 0, xMax: this.W, yMin: 0, yMax: this.H };
            this.axesMode = 'canvas';
        }
    }

    wx(x) {
        return (x - this.world.xMin) / (this.world.xMax - this.world.xMin) * this.W;
    }

    wy(y) {
        if (this.axesMode === 'math') {
            return this.H - (y - this.world.yMin) / (this.world.yMax - this.world.yMin) * this.H;
        }
        return y;
    }

    draw() {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        ctx.clearRect(0, 0, W, H);

        if (this.axesMode === 'math') this._drawMathAxes();

        for (const cn of this.eng.connects) {
            const ia = this.eng.instances[cn.a];
            const ib = this.eng.instances[cn.b];
            if (!ia || !ib) continue;
            const pa = this._instPos(ia);
            const pb = this._instPos(ib);
            if (!pa || !pb) continue;
            this._drawSpring(pa, pb, cn.state.rest || 100);
        }

        for (const inst of Object.values(this.eng.instances)) {
            const def = this.eng.objectDefs[inst.typeName];
            if (!def) continue;
            if (def.shape && def.shape.kind === 'rod') {
                const from = inst.state.from || inst.state.pivot;
                const to = inst.state.to || inst.state.pos;
                if (from && to) {
                    ctx.beginPath();
                    ctx.moveTo(this.wx(from[0]), this.wy(from[1]));
                    ctx.lineTo(this.wx(to[0]), this.wy(to[1]));
                    ctx.strokeStyle = evalExpr(def.shape.props.color || { type: 'Color', val: '#3a3a5a' }, {});
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }

        for (const inst of Object.values(this.eng.instances)) {
            const def = this.eng.objectDefs[inst.typeName];
            if (!def || !def.shape || def.shape.kind !== 'circle') continue;
            if (inst.state.pivot && inst.state.pos) {
                ctx.beginPath();
                ctx.moveTo(this.wx(inst.state.pivot[0]), this.wy(inst.state.pivot[1]));
                ctx.lineTo(this.wx(inst.state.pos[0]), this.wy(inst.state.pos[1]));
                ctx.strokeStyle = '#2a2a4a';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }

        for (const [name, inst] of Object.entries(this.eng.instances)) {
            const def = this.eng.objectDefs[inst.typeName];
            if (!def || !def.render) continue;
            const trailStmt = def.render.stmts.find((s) => s.kind === 'trail');
            if (!trailStmt) continue;
            const trail = this.eng.trails[name] || [];
            if (trail.length < 2) continue;
            const col = trailStmt.props.color ? evalExpr(trailStmt.props.color, {}) : '#ffffff';
            const op = trailStmt.props.opacity ? evalExpr(trailStmt.props.opacity, {}) : 0.3;
            ctx.beginPath();
            ctx.moveTo(this.wx(trail[0][0]), this.wy(trail[0][1]));
            for (let i = 1; i < trail.length; i += 1) ctx.lineTo(this.wx(trail[i][0]), this.wy(trail[i][1]));
            ctx.strokeStyle = col;
            ctx.globalAlpha = op;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        if (this.axesMode === 'math') {
            for (const inst of Object.values(this.eng.instances)) {
                const freq = inst.state.freq || 1;
                const amp = inst.state.amp || 1;
                const phase = inst.state.phase || 0;
                ctx.beginPath();
                ctx.strokeStyle = '#7fff6e';
                ctx.lineWidth = 2.5;
                ctx.shadowColor = '#7fff6e';
                ctx.shadowBlur = 8;
                let started = false;
                for (let px = 0; px <= W; px += 2) {
                    const x = this.world.xMin + px / W * (this.world.xMax - this.world.xMin);
                    const y = amp * Math.sin(freq * x + phase);
                    const cy = this.wy(y);
                    if (!started) {
                        ctx.moveTo(px, cy);
                        started = true;
                    } else {
                        ctx.lineTo(px, cy);
                    }
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
                break;
            }
        }

        for (const [name, inst] of Object.entries(this.eng.instances)) {
            const def = this.eng.objectDefs[inst.typeName];
            if (!def || !def.shape) continue;
            this._drawInstance(name, inst, def);
        }
    }

    _drawMathAxes() {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        const { xMin, xMax, yMin, yMax } = this.world;

        ctx.strokeStyle = '#16162a';
        ctx.lineWidth = 1;
        for (let x = Math.ceil(xMin); x <= xMax; x += 1) {
            const px = this.wx(x);
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, H);
            ctx.stroke();
        }
        for (let y = Math.ceil(yMin); y <= yMax; y += 1) {
            const py = this.wy(y);
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(W, py);
            ctx.stroke();
        }

        ctx.strokeStyle = '#3a3a5a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, this.wy(0));
        ctx.lineTo(W, this.wy(0));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.wx(0), 0);
        ctx.lineTo(this.wx(0), H);
        ctx.stroke();

        ctx.fillStyle = '#3a3a5a';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'center';
        for (let x = Math.ceil(xMin); x <= xMax; x += 1) {
            if (x === 0) continue;
            ctx.fillText(x, this.wx(x), this.wy(0) + 14);
        }
        ctx.textAlign = 'right';
        for (let y = Math.ceil(yMin); y <= yMax; y += 1) {
            if (y === 0) continue;
            ctx.fillText(y, this.wx(0) - 4, this.wy(y) + 3);
        }
    }

    _drawSpring(pa, pb, rest) {
        const ctx = this.ctx;
        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / d;
        const ny = dx / d;
        const segs = 12;
        const amp = 8;

        ctx.beginPath();
        ctx.moveTo(this.wx(pa[0]), this.wy(pa[1]));
        for (let i = 1; i < segs; i += 1) {
            const t = i / segs;
            const mx = pa[0] + t * dx + nx * amp * Math.sin(i * Math.PI);
            const my = pa[1] + t * dy + ny * amp * Math.sin(i * Math.PI);
            ctx.lineTo(this.wx(mx), this.wy(my));
        }
        ctx.lineTo(this.wx(pb[0]), this.wy(pb[1]));

        const stretch = Math.abs(d - rest) / (rest || 1);
        const r = Math.round(Math.min(255, stretch * 500));
        ctx.strokeStyle = `rgb(${r + 100},${200 - r},${100})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _instPos(inst) {
        if (inst.state.pos) return [inst.state.pos[0], inst.state.pos[1]];
        if (inst.state.x !== undefined) return [inst.state.x, inst.state.y || 0];
        return null;
    }

    _drawInstance(_name, inst, def) {
        const ctx = this.ctx;
        const shape = def.shape;
        const env = inst.state;

        let color = '#6e8fff';
        if (shape.props.color) color = evalExpr(shape.props.color, env);

        let cx = this.W / 2;
        let cy = this.H / 2;
        if (inst.state.pos) {
            cx = this.wx(inst.state.pos[0]);
            cy = this.wy(inst.state.pos[1]);
        } else if (inst.state.x !== undefined) {
            cx = this.wx(inst.state.x);
            cy = this.wy(inst.state.y || 0);
        }

        if (shape.kind === 'circle') {
            let r = 10;
            if (shape.props.r) r = evalExpr(shape.props.r, env);
            if (typeof r !== 'number') r = 10;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = inst.dragging ? 20 : 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            if (inst.state.pivot) {
                ctx.beginPath();
                ctx.arc(this.wx(inst.state.pivot[0]), this.wy(inst.state.pivot[1]), 5, 0, Math.PI * 2);
                ctx.fillStyle = '#4a4a6a';
                ctx.fill();
            }
        } else if (shape.kind === 'rect') {
            const w = shape.props.w ? evalExpr(shape.props.w, env) : 40;
            const h = shape.props.h ? evalExpr(shape.props.h, env) : 20;
            ctx.fillStyle = color;
            ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
        }
    }
}
