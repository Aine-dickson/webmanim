export const BUILTINS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    log: Math.log,
    exp: Math.exp,
    min: Math.min,
    max: Math.max,
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    lerp: (a, b, t) => a + (b - a) * t,
    mod: (a, b) => ((a % b) + b) % b,
    pow: Math.pow,
    norm: (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1]),
    normalize: (v) => {
        const m = Math.sqrt(v[0] * v[0] + v[1] * v[1]) || 1;
        return [v[0] / m, v[1] / m];
    },
    dot: (a, b) => a[0] * b[0] + a[1] * b[1],
    dist: (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2),
    reflect: (v, n) => {
        const d = 2 * (v[0] * n[0] + v[1] * n[1]);
        return [v[0] - d * n[0], v[1] - d * n[1]];
    },
    cross: (a, b) => a[0] * b[1] - a[1] * b[0],
    hooke: (k, rest, r) => k * (r - rest),
    lennard_jones: (r, eps, sig) => {
        const sr = sig / r;
        return 4 * eps * (12 * sr ** 13 - 6 * sr ** 7);
    },
    coulomb: (q1, q2, r) => 8.99e9 * q1 * q2 / (r * r),
    rand: (lo, hi) => (lo === undefined ? Math.random() : lo + Math.random() * (hi - lo)),
    normal: (mu, sig) => {
        let u = 0;
        let v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return mu + sig * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    fourier: (arr) => arr,
    laplacian: (g) => g,
    gradient: (g) => g
};

export function evalExpr(node, env) {
    switch (node.type) {
        case 'Num':
            return node.val;
        case 'Bool':
            return node.val;
        case 'Color':
            return node.val;
        case 'Str':
            return node.val;
        case 'Vec':
            return [evalExpr(node.x, env), evalExpr(node.y, env)];
        case 'Range':
            return [evalExpr(node.lo, env), evalExpr(node.hi, env)];
        case 'Var': {
            if (node.name in env) return env[node.name];
            if (node.name in BUILTINS) return BUILTINS[node.name];
            return 0;
        }
        case 'Field': {
            const obj = env[node.obj];
            if (obj && typeof obj === 'object' && node.field in obj) return obj[node.field];
            const key = node.obj + '.' + node.field;
            if (key in env) return env[key];
            return 0;
        }
        case 'Index': {
            const base = node.field ? (env[node.obj] || {})[node.field] : env[node.obj];
            if (Array.isArray(base)) {
                const idx = Math.round(evalExpr(node.idx, env));
                return base[idx] !== undefined ? base[idx] : 0;
            }
            return 0;
        }
        case 'UnOp': {
            const v = evalExpr(node.expr, env);
            if (node.op === '-') return Array.isArray(v) ? v.map((x) => -x) : -v;
            if (node.op === '!') return !v;
            return v;
        }
        case 'BinOp': {
            const l = evalExpr(node.left, env);
            const r = evalExpr(node.right, env);
            if (Array.isArray(l) && Array.isArray(r)) {
                switch (node.op) {
                    case '+': return [l[0] + r[0], l[1] + r[1]];
                    case '-': return [l[0] - r[0], l[1] - r[1]];
                    case '*': return [l[0] * r[0], l[1] * r[1]];
                    case '/': return [l[0] / r[0], l[1] / r[1]];
                }
            }
            if (Array.isArray(l) && !Array.isArray(r)) {
                switch (node.op) {
                    case '*': return [l[0] * r, l[1] * r];
                    case '/': return [l[0] / r, l[1] / r];
                    case '+': return [l[0] + r, l[1] + r];
                    case '-': return [l[0] - r, l[1] - r];
                }
            }
            if (!Array.isArray(l) && Array.isArray(r)) {
                switch (node.op) {
                    case '*': return [l * r[0], l * r[1]];
                    case '+': return [l + r[0], l + r[1]];
                }
            }
            switch (node.op) {
                case '+': return l + r;
                case '-': return l - r;
                case '*': return l * r;
                case '/': return r !== 0 ? l / r : 0;
                case '%': return ((l % r) + r) % r;
                case '^': return Math.pow(l, r);
                case '==': return l === r;
                case '!=': return l !== r;
                case '<': return l < r;
                case '<=': return l <= r;
                case '>': return l > r;
                case '>=': return l >= r;
                case '&&': return l && r;
                case '||': return l || r;
                default: return 0;
            }
        }
        case 'Call': {
            const fn = BUILTINS[node.fn];
            if (!fn) return 0;
            const args = node.args.map((a) => evalExpr(a, env));
            return fn(...args);
        }
        default:
            return 0;
    }
}
