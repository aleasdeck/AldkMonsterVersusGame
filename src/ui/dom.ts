export type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, unknown> | null;

/** Крошечный конструктор DOM: h('div', { class: 'x', onclick: fn }, 'text', child). */
export function h(tag: string, attrs: Attrs = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'style') el.setAttribute('style', String(value));
      else if (key === 'html') el.innerHTML = String(value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'disabled') {
        if (value) el.setAttribute('disabled', '');
      } else if (key.startsWith('data-')) el.setAttribute(key, String(value));
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function button(label: Child, onclick: () => void, opts: { class?: string; disabled?: boolean; title?: string } = {}): HTMLElement {
  return h(
    'button',
    {
      class: `btn ${opts.class ?? ''}`.trim(),
      onclick: () => {
        if (!opts.disabled) onclick();
      },
      disabled: opts.disabled,
      title: opts.title,
    },
    label,
  );
}
