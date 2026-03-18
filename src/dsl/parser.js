import { TT } from './lexer.js';

export class ParseError extends Error {
    constructor(message, token, partialAst) {
        super(message);
        this.name = 'ParseError';
        this.token = token;
        this.partialAst = partialAst;
    }
}

export function parse(tokens) {
    let pos = 0;
    const eofToken = tokens[tokens.length - 1] || { t: TT.EOF, v: undefined, line: 1, col: 1, index: 0 };
    const ast = { type: 'Program', objects: [], scene: null };
    const context = [];

    const peek = () => tokens[pos] || eofToken;
    const next = () => {
        const tk = peek();
        pos += 1;
        return tk;
    };

    const formatToken = (tk) => {
        const shown = tk && tk.v !== undefined ? ` '${tk.v}'` : '';
        return `${tk.t}${shown}`;
    };

    const clonePartialAst = () => {
        const snap = JSON.parse(JSON.stringify(ast));
        snap.__partial = true;
        snap.__context = [...context];
        return snap;
    };

    const fail = (message, tk = peek()) => {
        const loc = `line ${tk.line ?? '?'} col ${tk.col ?? '?'} near ${formatToken(tk)}`;
        throw new ParseError(`${message} at ${loc}`, tk, clonePartialAst());
    };

    const eat = (t) => {
        if (peek().t !== t) fail(`Expected ${t}, got ${peek().t}`);
        return next();
    };

    const maybe = (t) => {
        if (peek().t !== t) return false;
        next();
        return true;
    };

    const eatId = (v) => {
        if (peek().t !== TT.IDENT || peek().v !== v) fail(`Expected keyword '${v}', got '${peek().v}'`);
        return next();
    };

    const withContext = (label, fn) => {
        context.push(label);
        try {
            return fn();
        } finally {
            context.pop();
        }
    };

    // Formal grammar v0.1: program = object_def* scene_def
    while (peek().t === TT.IDENT && peek().v === 'object') parseObject();

    if (!(peek().t === TT.IDENT && peek().v === 'scene')) {
        fail("Program requires exactly one scene after object declarations");
    }
    parseScene();

    if (peek().t !== TT.EOF) {
        fail('Unexpected tokens after scene block');
    }

    return ast;

    function parseObject() {
        eatId('object');
        const name = eat(TT.IDENT).v;
        const node = {
            type: 'Object',
            name,
            shape: null,
            state: null,
            evolve: null,
            on: [],
            render: null,
            __incomplete: true
        };
        ast.objects.push(node);

        return withContext(`object:${name}`, () => {
            eat(TT.LBRACE);
            const seen = { shape: false, state: false, evolve: false, render: false };
            while (peek().t !== TT.RBRACE) {
                const kw = peek().v;
                if (kw === 'shape') {
                    if (seen.shape) fail("Duplicate 'shape' clause in object");
                    node.shape = parseShape();
                    seen.shape = true;
                } else if (kw === 'state') {
                    if (seen.state) fail("Duplicate 'state' clause in object");
                    node.state = parseState();
                    seen.state = true;
                } else if (kw === 'evolve') {
                    if (seen.evolve) fail("Duplicate 'evolve' clause in object");
                    node.evolve = parseEvolve();
                    seen.evolve = true;
                }
                else if (kw === 'on') node.on.push(parseOn());
                else if (kw === 'render') {
                    if (seen.render) fail("Duplicate 'render' clause in object");
                    node.render = parseRender();
                    seen.render = true;
                }
                else fail(`Object body has unknown clause '${kw}'`);
            }
            eat(TT.RBRACE);
            delete node.__incomplete;
            return node;
        });
    }

    function parseShape() {
        return withContext('shape', () => {
            eatId('shape');
            eat(TT.COLON);
            const kind = eat(TT.IDENT).v;
            const props = parseProps(['r', 'w', 'h', 'color', 'opacity', 'from', 'to', 'fill', 'stroke']);
            return { type: 'Shape', kind, props };
        });
    }

    function parseProps(allowed) {
        const props = {};
        while (peek().t === TT.IDENT) {
            if (!(tokens[pos + 1] && tokens[pos + 1].t === TT.COLON)) break;

            const key = peek().v;
            if (allowed && allowed.length > 0 && !allowed.includes(key)) {
                fail(`Unexpected property '${key}'`);
            }

            next();
            eat(TT.COLON);
            const lo = parseExpr();
            if (maybe(TT.DOTDOT)) {
                const hi = parseExpr();
                props[key] = { type: 'Range', lo, hi };
            } else {
                props[key] = lo;
            }
        }
        return props;
    }

    function parseState() {
        return withContext('state', () => {
            eatId('state');
            eat(TT.LBRACE);
            const entries = [];
            while (peek().t !== TT.RBRACE) {
                const name = eat(TT.IDENT).v;
                if (maybe(TT.COLON)) {
                    const val = parseExpr();
                    entries.push({ kind: 'value', name, val });
                    continue;
                }

                if (maybe(TT.LBRACKET)) {
                    if (maybe(TT.RBRACKET)) {
                        entries.push({ kind: 'list', name });
                        continue;
                    }

                    const wTok = eat(TT.NUM);
                    if (!Number.isInteger(wTok.v) || wTok.v < 0) fail('Grid width must be a non-negative integer', wTok);
                    eat(TT.COMMA);
                    const hTok = eat(TT.NUM);
                    if (!Number.isInteger(hTok.v) || hTok.v < 0) fail('Grid height must be a non-negative integer', hTok);
                    eat(TT.RBRACKET);
                    entries.push({ kind: 'grid', name, width: wTok.v, height: hTok.v });
                    continue;
                }

                fail(`Invalid state entry for '${name}'`);
            }
            eat(TT.RBRACE);
            return { type: 'State', entries };
        });
    }

    function parseEvolve() {
        return withContext('evolve', () => {
            eatId('evolve');
            let dtName = 'dt';
            let method = 'rk4';
            if (peek().t === TT.IDENT && peek().v === 'dt') {
                next();
                eat(TT.COLON);
                dtName = eat(TT.IDENT).v;
            }
            if (peek().t === TT.IDENT && peek().v === 'method') {
                next();
                eat(TT.COLON);
                method = eat(TT.IDENT).v;
            }
            eat(TT.LBRACE);
            const assigns = [];
            while (peek().t !== TT.RBRACE) assigns.push(parseAssign());
            eat(TT.RBRACE);
            return { type: 'Evolve', dtName, method, assigns };
        });
    }

    function parseOn() {
        return withContext('on', () => {
            eatId('on');
            const event = eat(TT.IDENT).v;
            let target = null;
            if (peek().t === TT.LPAREN) {
                next();
                target = eat(TT.IDENT).v;
                eat(TT.RPAREN);
            }
            eat(TT.LBRACE);
            const assigns = [];
            while (peek().t !== TT.RBRACE) assigns.push(parseAssign());
            eat(TT.RBRACE);
            return { type: 'On', event, target, assigns };
        });
    }

    function parseRender() {
        return withContext('render', () => {
            eatId('render');
            eat(TT.LBRACE);
            const stmts = [];
            while (peek().t !== TT.RBRACE) {
                const kw = eat(TT.IDENT).v;
                const props = parseProps(['color', 'opacity', 'length', 'scale', 'width', 'at', 'x', 'y']);
                stmts.push({ kind: kw, props });
            }
            eat(TT.RBRACE);
            return { type: 'Render', stmts };
        });
    }

    function parseScene() {
        eatId('scene');
        const title = eat(TT.STR).v;
        const node = {
            type: 'Scene',
            title,
            lets: [],
            connects: [],
            environment: null,
            control: null,
            render: null,
            __incomplete: true
        };
        ast.scene = node;

        return withContext(`scene:${title}`, () => {
            eat(TT.LBRACE);
            while (peek().t !== TT.RBRACE) {
                const kw = peek().v;
                if (kw === 'let') node.lets.push(parseLet());
                else if (kw === 'connect') node.connects.push(parseConnect());
                else if (kw === 'environment') node.environment = parseEnvironment();
                else if (kw === 'control') node.control = parseControl();
                else if (kw === 'render') node.render = parseRender();
                else fail(`Scene body has unknown clause '${kw}'`);
            }
            eat(TT.RBRACE);
            delete node.__incomplete;
            return node;
        });
    }

    function parseLet() {
        return withContext('let', () => {
            eatId('let');
            const instName = eat(TT.IDENT).v;
            eat(TT.EQ);
            const typeName = eat(TT.IDENT).v;
            let at = null;
            if (peek().t === TT.IDENT && peek().v === 'at') {
                next();
                at = parseExpr();
            }
            const overrides = {};
            if (peek().t === TT.LBRACE) {
                next();
                while (peek().t !== TT.RBRACE) {
                    if (peek().t === TT.COMMA) {
                        fail("Commas are not allowed between overrides in let blocks; use whitespace-separated entries");
                    }
                    const k = eat(TT.IDENT).v;
                    eat(TT.COLON);
                    overrides[k] = parseExpr();
                }
                next();
            }
            return { type: 'Let', instName, typeName, at, overrides };
        });
    }

    function parseConnect() {
        return withContext('connect', () => {
            eatId('connect');
            const a = eat(TT.IDENT).v;
            eat(TT.COMMA);
            const b = eat(TT.IDENT).v;
            eatId('via');
            const via = eat(TT.IDENT).v;
            const overrides = {};
            if (peek().t === TT.LBRACE) {
                next();
                while (peek().t !== TT.RBRACE) {
                    if (peek().t === TT.COMMA) {
                        fail("Commas are not allowed between overrides in connect blocks; use whitespace-separated entries");
                    }
                    const k = eat(TT.IDENT).v;
                    eat(TT.COLON);
                    overrides[k] = parseExpr();
                }
                next();
            }
            return { type: 'Connect', a, b, via, overrides };
        });
    }

    function parseEnvironment() {
        return withContext('environment', () => {
            eatId('environment');
            eat(TT.LBRACE);
            const props = {};
            while (peek().t !== TT.RBRACE) {
                const k = eat(TT.IDENT).v;
                eat(TT.COLON);
                props[k] = parseExpr();
            }
            eat(TT.RBRACE);
            return { type: 'Environment', props };
        });
    }

    function parseControl() {
        return withContext('control', () => {
            eatId('control');
            eat(TT.LBRACE);
            const stmts = [];
            while (peek().t !== TT.RBRACE) {
                const kw = eat(TT.IDENT).v;
                if (kw === 'slider') {
                    let target = eat(TT.IDENT).v;
                    if (peek().t === TT.DOT) {
                        next();
                        target += '.' + eat(TT.IDENT).v;
                    }
                    eatId('range');
                    eat(TT.COLON);
                    const lo = parseExpr();
                    eat(TT.DOTDOT);
                    const hi = parseExpr();
                    const opts = parseProps(['default', 'label']);
                    stmts.push({ kind: 'slider', target, lo, hi, opts });
                } else if (kw === 'toggle') {
                    let target = eat(TT.IDENT).v;
                    if (peek().t === TT.DOT) {
                        next();
                        target += '.' + eat(TT.IDENT).v;
                    }
                    const opts = parseProps(['label']);
                    stmts.push({ kind: 'toggle', target, opts });
                } else if (kw === 'button') {
                    const label = eat(TT.STR).v;
                    eat(TT.LBRACE);
                    const assigns = [];
                    while (peek().t !== TT.RBRACE) assigns.push(parseAssign());
                    eat(TT.RBRACE);
                    stmts.push({ kind: 'button', label, assigns });
                } else {
                    fail(`Control has unknown statement '${kw}'`);
                }
            }
            eat(TT.RBRACE);
            return { type: 'Control', stmts };
        });
    }

    function parseAssign() {
        let target = eat(TT.IDENT).v;
        const opMap = {
            [TT.EQ]: '=',
            [TT.PLUSEQ]: '+=',
            [TT.MINUSEQ]: '-=',
            [TT.STAREQ]: '*=',
            [TT.SLASHEQ]: '/='
        };
        const op = opMap[peek().t];
        if (!op) fail(`Assignment expected operator, got '${peek().t}'`);
        next();
        const expr = parseExpr();
        return { type: 'Assign', target, op, expr };
    }

    function parseExpr(minBP = 0) {
        let left = parseUnary();
        while (true) {
            const op = infixOp(peek().t);
            if (!op || op.lbp <= minBP) break;
            next();
            const right = parseExpr(op.rbp);
            left = { type: 'BinOp', op: op.sym, left, right };
        }
        return left;
    }

    function infixOp(t) {
        const ops = {
            [TT.OR]: { lbp: 1, rbp: 1, sym: '||' },
            [TT.AND]: { lbp: 2, rbp: 2, sym: '&&' },
            [TT.EQEQ]: { lbp: 3, rbp: 3, sym: '==' },
            [TT.NEQ]: { lbp: 3, rbp: 3, sym: '!=' },
            [TT.LT]: { lbp: 4, rbp: 4, sym: '<' },
            [TT.LTE]: { lbp: 4, rbp: 4, sym: '<=' },
            [TT.GT]: { lbp: 4, rbp: 4, sym: '>' },
            [TT.GTE]: { lbp: 4, rbp: 4, sym: '>=' },
            [TT.PLUS]: { lbp: 5, rbp: 5, sym: '+' },
            [TT.MINUS]: { lbp: 5, rbp: 5, sym: '-' },
            [TT.STAR]: { lbp: 6, rbp: 6, sym: '*' },
            [TT.SLASH]: { lbp: 6, rbp: 6, sym: '/' },
            [TT.PERCENT]: { lbp: 6, rbp: 6, sym: '%' },
            [TT.CARET]: { lbp: 7, rbp: 6, sym: '^' }
        };
        return ops[t] || null;
    }

    function parseUnary() {
        if (peek().t === TT.MINUS) {
            next();
            return { type: 'UnOp', op: '-', expr: parseUnary() };
        }
        if (peek().t === TT.BANG) {
            next();
            return { type: 'UnOp', op: '!', expr: parseUnary() };
        }
        return parsePrimary();
    }

    function parsePrimary() {
        const tk = peek();

        if (tk.t === TT.NUM) {
            next();
            return { type: 'Num', val: tk.v };
        }
        if (tk.t === TT.BOOL) {
            next();
            return { type: 'Bool', val: tk.v };
        }
        if (tk.t === TT.COLOR) {
            next();
            return { type: 'Color', val: tk.v };
        }
        if (tk.t === TT.STR) {
            next();
            return { type: 'Str', val: tk.v };
        }

        if (tk.t === TT.LBRACKET) {
            next();
            const x = parseExpr();
            eat(TT.COMMA);
            const y = parseExpr();
            eat(TT.RBRACKET);
            return { type: 'Vec', x, y };
        }

        if (tk.t === TT.LPAREN) {
            next();
            const e = parseExpr();
            eat(TT.RPAREN);
            return e;
        }

        if (tk.t === TT.IDENT) {
            next();

            if (peek().t === TT.LPAREN) {
                next();
                const args = [];
                if (peek().t !== TT.RPAREN) {
                    args.push(parseExpr());
                    while (peek().t === TT.COMMA) {
                        next();
                        args.push(parseExpr());
                    }
                }
                eat(TT.RPAREN);
                return { type: 'Call', fn: tk.v, args };
            }

            if (peek().t === TT.DOT) {
                next();
                const field = eat(TT.IDENT).v;
                if (peek().t === TT.LBRACKET) {
                    next();
                    const idx = parseExpr();
                    eat(TT.RBRACKET);
                    return { type: 'Index', obj: tk.v, field, idx };
                }
                return { type: 'Field', obj: tk.v, field };
            }

            if (peek().t === TT.LBRACKET) {
                next();
                const idx = parseExpr();
                eat(TT.RBRACKET);
                return { type: 'Index', obj: tk.v, field: null, idx };
            }

            return { type: 'Var', name: tk.v };
        }

        fail(`Unexpected token ${tk.t} ('${tk.v}')`, tk);
        return null;
    }
}
