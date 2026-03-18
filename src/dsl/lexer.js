export const TT = {
    IDENT: 'IDENT', NUM: 'NUM', STR: 'STR', BOOL: 'BOOL', COLOR: 'COLOR',
    LBRACE: 'LBRACE', RBRACE: 'RBRACE', LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
    LPAREN: 'LPAREN', RPAREN: 'RPAREN',
    COLON: 'COLON', DOT: 'DOT', DOTDOT: 'DOTDOT', COMMA: 'COMMA',
    EQ: 'EQ', PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH',
    PERCENT: 'PERCENT', CARET: 'CARET',
    PLUSEQ: 'PLUSEQ', MINUSEQ: 'MINUSEQ', STAREQ: 'STAREQ', SLASHEQ: 'SLASHEQ',
    EQEQ: 'EQEQ', NEQ: 'NEQ', LT: 'LT', LTE: 'LTE', GT: 'GT', GTE: 'GTE',
    AND: 'AND', OR: 'OR', BANG: 'BANG',
    EOF: 'EOF'
};

export function lex(src) {
    const tokens = [];
    let i = 0;
    let line = 1;
    let col = 1;
    const len = src.length;

    function advance() {
        const ch = src[i];
        i += 1;
        if (ch === '\n') {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }

    function advanceTo(target) {
        while (i < target) advance();
    }

    function posMark() {
        return { line, col, index: i };
    }

    function pushToken(t, v, mark) {
        tokens.push({ t, v, line: mark.line, col: mark.col, index: mark.index });
    }

    while (i < len) {
        if (/\s/.test(src[i])) { advance(); continue; }

        if (src[i] === '/' && src[i + 1] === '/') {
            while (i < len && src[i] !== '\n') advance();
            continue;
        }

        if (src[i] === '/' && src[i + 1] === '*') {
            const mark = posMark();
            advance();
            advance();
            while (i < len && !(src[i] === '*' && src[i + 1] === '/')) advance();
            if (i < len) {
                advance();
                advance();
            } else {
                throw new Error(`Unterminated block comment starting at line ${mark.line}, col ${mark.col}`);
            }
            continue;
        }

        if (src[i] === '#') {
            const mark = posMark();
            let j = i + 1;
            while (j < len && /[0-9a-fA-F]/.test(src[j])) j += 1;
            pushToken(TT.COLOR, src.slice(i, j), mark);
            advanceTo(j);
            continue;
        }

        if (src[i] === '"') {
            const mark = posMark();
            let j = i + 1;
            while (j < len && src[j] !== '"') j += 1;
            if (j >= len) {
                throw new Error(`Unterminated string starting at line ${mark.line}, col ${mark.col}`);
            }
            pushToken(TT.STR, src.slice(i + 1, j), mark);
            if (j < len) j += 1;
            advanceTo(j);
            continue;
        }

        if (/[0-9]/.test(src[i]) ||
            (src[i] === '-' && /[0-9]/.test(src[i + 1]) &&
                (tokens.length === 0 || ['COLON', 'EQ', 'PLUSEQ', 'MINUSEQ', 'LBRACKET', 'COMMA', 'LPAREN'].includes(tokens[tokens.length - 1].t)))) {
            const mark = posMark();
            let j = i;
            if (src[j] === '-') j += 1;
            while (j < len && /[0-9]/.test(src[j])) j += 1;
            if (j < len && src[j] === '.' && src[j + 1] !== '.') {
                j += 1;
                while (j < len && /[0-9]/.test(src[j])) j += 1;
            }
            if (j < len && (src[j] === 'e' || src[j] === 'E')) {
                j += 1;
                if (src[j] === '+' || src[j] === '-') j += 1;
                while (j < len && /[0-9]/.test(src[j])) j += 1;
            }
            pushToken(TT.NUM, parseFloat(src.slice(i, j)), mark);
            advanceTo(j);
            continue;
        }

        if (/[a-zA-Z_]/.test(src[i])) {
            const mark = posMark();
            let j = i;
            while (j < len && /[a-zA-Z0-9_]/.test(src[j])) j += 1;
            const word = src.slice(i, j);
            if (word === 'true' || word === 'false') pushToken(TT.BOOL, word === 'true', mark);
            else pushToken(TT.IDENT, word, mark);
            advanceTo(j);
            continue;
        }

        const two = src.slice(i, i + 2);
        if (two === '+=') { pushToken(TT.PLUSEQ, undefined, posMark()); advance(); advance(); continue; }
        if (two === '-=') { pushToken(TT.MINUSEQ, undefined, posMark()); advance(); advance(); continue; }
        if (two === '*=') { pushToken(TT.STAREQ, undefined, posMark()); advance(); advance(); continue; }
        if (two === '/=') { pushToken(TT.SLASHEQ, undefined, posMark()); advance(); advance(); continue; }
        if (two === '==') { pushToken(TT.EQEQ, undefined, posMark()); advance(); advance(); continue; }
        if (two === '!=') { pushToken(TT.NEQ, undefined, posMark()); advance(); advance(); continue; }
        if (two === '<=') { pushToken(TT.LTE, undefined, posMark()); advance(); advance(); continue; }
        if (two === '>=') { pushToken(TT.GTE, undefined, posMark()); advance(); advance(); continue; }
        if (two === '&&') { pushToken(TT.AND, undefined, posMark()); advance(); advance(); continue; }
        if (two === '||') { pushToken(TT.OR, undefined, posMark()); advance(); advance(); continue; }
        if (two === '..') { pushToken(TT.DOTDOT, undefined, posMark()); advance(); advance(); continue; }

        const ch = src[i];
        const map = {
            '{': TT.LBRACE, '}': TT.RBRACE, '[': TT.LBRACKET, ']': TT.RBRACKET,
            '(': TT.LPAREN, ')': TT.RPAREN, ':': TT.COLON, '.': TT.DOT,
            ',': TT.COMMA, '=': TT.EQ, '+': TT.PLUS, '-': TT.MINUS,
            '*': TT.STAR, '/': TT.SLASH, '%': TT.PERCENT, '^': TT.CARET,
            '<': TT.LT, '>': TT.GT, '!': TT.BANG
        };

        if (map[ch]) {
            pushToken(map[ch], undefined, posMark());
            advance();
            continue;
        }

        throw new Error(`Unexpected character '${ch}' at line ${line}, col ${col}`);
    }

    tokens.push({ t: TT.EOF, line, col, index: i });
    return tokens;
}
