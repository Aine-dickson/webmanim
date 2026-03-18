import { evalExpr } from './evaluator.js';

export function applyOp(op, cur, val) {
    if (op === '=') return val;
    if (op === '+=') {
        if (Array.isArray(cur) && Array.isArray(val)) return [cur[0] + val[0], cur[1] + val[1]];
        return cur + val;
    }
    if (op === '-=') return Array.isArray(cur) ? [cur[0] - val[0], cur[1] - val[1]] : cur - val;
    if (op === '*=') return Array.isArray(cur) ? [cur[0] * val, cur[1] * val] : cur * val;
    if (op === '/=') return cur / val;
    return val;
}

export class Engine {
    constructor(ast) {
        this.ast = ast;
        this.objectDefs = {};
        this.instances = {};
        this.connects = [];
        this.env = {};
        this.time = 0;
        this.dt = 1 / 60;
        this.running = false;
        this.trails = {};
        this.maxTrail = 180;

        this._build();
    }

    _build() {
        for (const obj of this.ast.objects) this.objectDefs[obj.name] = obj;

        const sc = this.ast.scene;
        if (!sc) return;

        this.env = { gravity: [0, 9.8], boundary: 'none', damping: 0 };
        if (sc.environment) {
            for (const [k, v] of Object.entries(sc.environment.props)) this.env[k] = evalExpr(v, {});
        }

        for (const lt of sc.lets) {
            const def = this.objectDefs[lt.typeName];
            if (!def) throw new Error(`Unknown object type '${lt.typeName}'`);
            const state = this._defaultState(def);

            if (lt.at) {
                const at = evalExpr(lt.at, {});
                if (Array.isArray(at)) state.pos = at;
                else state.x = at;
            }

            for (const [k, v] of Object.entries(lt.overrides)) state[k] = evalExpr(v, state);

            this.instances[lt.instName] = { typeName: lt.typeName, state, dragging: false };
            this.trails[lt.instName] = [];
        }

        for (const cn of sc.connects) {
            const def = this.objectDefs[cn.via];
            if (!def) throw new Error(`Unknown relation type '${cn.via}'`);
            const state = this._defaultState(def);
            for (const [k, v] of Object.entries(cn.overrides)) state[k] = evalExpr(v, state);
            this.connects.push({ a: cn.a, b: cn.b, typeName: cn.via, def, state });
        }
    }

    _defaultState(def) {
        const state = {};
        if (!def.state) return state;
        for (const e of def.state.entries) {
            if (e.kind === 'grid') {
                const rows = [];
                for (let y = 0; y < e.height; y += 1) rows.push(new Array(e.width).fill(0));
                state[e.name] = rows;
            } else if (e.kind === 'list') {
                state[e.name] = [];
            } else {
                state[e.name] = evalExpr(e.val, state);
            }
        }
        return state;
    }

    _makeEnv(inst, extra = {}, dtName = 'dt') {
        const env = Object.assign({}, inst.state, extra, { gravity: this.env.gravity });
        env[dtName || 'dt'] = this.dt;
        return env;
    }

    _applyAssigns(assigns, stateRef, env) {
        for (const a of assigns) {
            const val = evalExpr(a.expr, env);
            const cur = stateRef[a.target] !== undefined ? stateRef[a.target] : 0;
            const next = applyOp(a.op, cur, val);
            stateRef[a.target] = next;
            env[a.target] = next;
        }
    }

    tick() {
        for (const inst of Object.values(this.instances)) {
            if (inst.dragging) continue;
            const def = this.objectDefs[inst.typeName];
            if (!def || !def.evolve) continue;

            const env = this._makeEnv(inst, {}, def.evolve.dtName || 'dt');
            this._applyAssigns(def.evolve.assigns, inst.state, env);
        }

        for (const cn of this.connects) {
            const instA = this.instances[cn.a];
            const instB = this.instances[cn.b];
            if (!instA || !instB || !cn.def.evolve) continue;

            const relInst = { state: cn.state };
            const env = this._makeEnv(
                relInst,
                {
                    a: instA.state,
                    b: instB.state,
                    relation: cn.state,
                    environment: this.env
                },
                cn.def.evolve.dtName || 'dt'
            );
            this._applyAssigns(cn.def.evolve.assigns, cn.state, env);
        }

        const W = 760;
        const H = 480;
        for (const inst of Object.values(this.instances)) {
            if (!inst.state.pos) continue;
            const [x, y] = inst.state.pos;
            const v = inst.state.vel || [0, 0];
            if (this.env.boundary === 'walls') {
                let nx = x;
                let ny = y;
                let vx = v[0];
                let vy = v[1];
                if (x < 0) { nx = 0; vx = Math.abs(vx) * 0.8; }
                if (x > W) { nx = W; vx = -Math.abs(vx) * 0.8; }
                if (y < 0) { ny = 0; vy = Math.abs(vy) * 0.8; }
                if (y > H) { ny = H; vy = -Math.abs(vy) * 0.8; }
                inst.state.pos = [nx, ny];
                inst.state.vel = [vx, vy];
            } else if (this.env.boundary === 'wrap') {
                inst.state.pos = [((x % W) + W) % W, ((y % H) + H) % H];
            }
        }

        for (const [name, inst] of Object.entries(this.instances)) {
            if (!inst.state.pos) continue;
            const tr = this.trails[name];
            tr.push([...inst.state.pos]);
            if (tr.length > this.maxTrail) tr.shift();
        }

        this.time += this.dt;
    }

    onDrag(instName, mousePos) {
        const inst = this.instances[instName];
        if (!inst) return;
        inst.dragging = true;
        const def = this.objectDefs[inst.typeName];
        const dragHandlers = (def.on || []).filter((o) => o.event === 'drag');
        for (const h of dragHandlers) {
            const env = Object.assign({}, inst.state, {
                mouse: {
                    pos: mousePos,
                    vel: [0, 0],
                    delta: [0, 0]
                },
                dt: this.dt
            });
            this._applyAssigns(h.assigns, inst.state, env);
        }
    }

    onRelease(instName, mouseVel) {
        const inst = this.instances[instName];
        if (!inst) return;
        inst.dragging = false;
        const def = this.objectDefs[inst.typeName];
        const handlers = (def.on || []).filter((o) => o.event === 'release');
        for (const h of handlers) {
            const env = Object.assign({}, inst.state, {
                mouse: {
                    pos: inst.state.pos || [inst.state.x || 0, inst.state.y || 0],
                    vel: mouseVel,
                    delta: [0, 0]
                },
                dt: this.dt
            });
            this._applyAssigns(h.assigns, inst.state, env);
        }
    }

    applyControlAssigns(assigns) {
        for (const a of assigns) {
            const val = evalExpr(a.expr, {});
            if (a.target.includes('.')) {
                const [obj, field] = a.target.split('.');
                if (this.instances[obj]) {
                    const s = this.instances[obj].state;
                    const cur = s[field] !== undefined ? s[field] : 0;
                    s[field] = applyOp(a.op, cur, val);
                }
                continue;
            }

            for (const inst of Object.values(this.instances)) {
                if (inst.state[a.target] !== undefined) {
                    const cur = inst.state[a.target];
                    inst.state[a.target] = applyOp(a.op, cur, val);
                }
            }
        }
    }

    setParam(target, value) {
        if (target.includes('.')) {
            const [obj, field] = target.split('.');

            if (obj in this.env && Array.isArray(this.env[obj])) {
                if (field === 'x') this.env[obj][0] = value;
                if (field === 'y') this.env[obj][1] = value;
            }

            for (const [name, inst] of Object.entries(this.instances)) {
                if (name === obj || inst.typeName === obj) inst.state[field] = value;
            }

            for (const cn of this.connects) {
                if (cn.typeName === obj) cn.state[field] = value;
            }
            return;
        }

        for (const inst of Object.values(this.instances)) {
            if (inst.state[target] !== undefined) inst.state[target] = value;
        }

        if (target in this.env) this.env[target] = value;
    }
}
