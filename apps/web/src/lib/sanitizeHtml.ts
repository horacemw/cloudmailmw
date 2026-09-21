/**
 * Email-body HTML sanitizer.
 *
 * Runs in the browser using the DOM parser. Removes anything that can execute
 * JavaScript, load external resources that aren't images/CSS, or click-jack the
 * webmail (frames, forms with external actions, meta refresh).
 *
 * This is intentionally strict. Email HTML is untrusted external input;
 * treating it as trusted has caused stored XSS in most webmail projects at
 * some point.
 *
 * NOT intended for signatures (see composerSanitizeHtml) which allows a
 * narrower whitelist of safe formatting + CID images the user themselves
 * authored.
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'blockquote', 'br', 'caption',
  'code', 'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre',
  'q', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u',
  'ul', 'var', 'wbr', 'font', 'center', 'style',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['class', 'style', 'title', 'lang', 'dir', 'id', 'align']),
  a: new Set(['href', 'name', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'valign', 'align', 'width', 'height', 'bgcolor']),
  th: new Set(['colspan', 'rowspan', 'valign', 'align', 'width', 'height', 'scope', 'bgcolor']),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'width', 'height', 'bgcolor']),
  font: new Set(['color', 'face', 'size']),
};

// URLs we allow inside `href` and `src`. mailto/tel/https are safe.
// Explicitly refuse javascript: and data: URLs on href (data: on img is
// allowed for inline images embedded in the message itself).
function isSafeUrl(url: string, forImg = false): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:')) return false;
  if (lower.startsWith('vbscript:')) return false;
  if (lower.startsWith('data:')) return forImg && lower.startsWith('data:image/');
  if (lower.startsWith('cid:')) return forImg;
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    !/[:]/.test(trimmed.slice(0, 20)) // relative
  );
}

// Trim inline style to a small safe subset. Blocks position:fixed, expressions,
// url() with javascript, and CSS behaviors.
function sanitizeStyle(raw: string): string {
  return raw
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const [k, v] = d.split(':').map((s) => (s ?? '').trim().toLowerCase());
      if (!k || !v) return false;
      if (/expression|javascript|vbscript|behavior|@import|url\s*\(\s*['"]?\s*(javascript|data)/.test(v)) return false;
      if (k === 'position' && (v === 'fixed' || v === 'sticky')) return false;
      return true;
    })
    .join('; ');
}

export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        toRemove.push(el);
      } else {
        // Prune attributes.
        for (const attr of [...el.attributes]) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            continue;
          }
          const allowed =
            ALLOWED_ATTRS['*']!.has(name) || (ALLOWED_ATTRS[tag]?.has(name) ?? false);
          if (!allowed) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (name === 'href') {
            if (!isSafeUrl(attr.value, false)) el.removeAttribute(attr.name);
            else if (attr.value.startsWith('http')) {
              el.setAttribute('rel', 'noopener noreferrer');
              el.setAttribute('target', '_blank');
            }
          }
          if (name === 'src') {
            if (!isSafeUrl(attr.value, true)) el.removeAttribute(attr.name);
          }
          if (name === 'style') {
            el.setAttribute('style', sanitizeStyle(attr.value));
          }
        }
      }
    }
    node = walker.nextNode();
  }
  for (const el of toRemove) el.remove();
  return doc.body.innerHTML;
}
