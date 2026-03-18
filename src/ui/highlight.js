const KWS = [
  'object', 'scene', 'shape', 'state', 'evolve', 'on', 'render', 'let', 'connect', 'via',
  'environment', 'control', 'slider', 'toggle', 'button', 'method', 'range', 'default',
  'label', 'at', 'axes', 'trail', 'vector', 'trail', 'graph', 'boundary', 'gravity',
  'damping', 'field'
];

const FNS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'floor', 'ceil',
  'round', 'log', 'exp', 'min', 'max', 'clamp', 'lerp', 'mod', 'norm', 'normalize',
  'dot', 'dist', 'reflect', 'cross', 'hooke', 'lennard_jones', 'coulomb', 'rand', 'normal'
];

const METH = ['rk4', 'euler', 'verlet', 'leapfrog'];

export function highlight(src) {
  return src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\/\/[^\n]*)/g, '<span style="color:var(--cm)">$1</span>')
    .replace(/"([^"]*)"/g, '<span style="color:var(--str)">"$1"</span>')
    .replace(/(#[0-9a-fA-F]{3,6})\b/g, (m) => `<span style="color:${m}">${m}</span>`)
    .replace(/\b(true|false)\b/g, '<span style="color:var(--accent4)">$1</span>')
    .replace(new RegExp('\\b(' + KWS.join('|') + ')\\b', 'g'), '<span style="color:var(--kw)">$1</span>')
    .replace(new RegExp('\\b(' + FNS.join('|') + ')\\b', 'g'), '<span style="color:var(--fn)">$1</span>')
    .replace(new RegExp('\\b(' + METH.join('|') + ')\\b', 'g'), '<span style="color:var(--accent4)">$1</span>')
    .replace(/\b(-?\d+\.?\d*)\b/g, '<span style="color:var(--num)">$1</span>');
}
