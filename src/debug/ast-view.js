export function renderAST(node, _depth = 0) {
  if (!node || typeof node !== 'object') {
    return `<span style="color:var(--num)">${JSON.stringify(node)}</span>`;
  }
  if (Array.isArray(node)) return '[' + node.map((n) => renderAST(n)).join(', ') + ']';
  if (node.type) {
    const kids = Object.entries(node).filter(([k]) => k !== 'type');
    const inner = kids
      .map(([k, v]) => `<span style="color:var(--muted)">${k}</span>: ${renderAST(v)}`)
      .join('\n');
    return `<span class="astk">${node.type}</span> {\n<div class="astnode">${inner}</div>}`;
  }
  return JSON.stringify(node);
}
