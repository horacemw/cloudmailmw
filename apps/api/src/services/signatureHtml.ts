import * as htmlparser2 from 'htmlparser2';
import { DomHandler, Element as DomElement, Text as DomText } from 'domhandler';
import type { ChildNode as DomChildNode, Document as DomDocument } from 'domhandler';
import * as domutils from 'domutils';
import { render as renderDom } from 'dom-serializer';

/**
 * Server-side sanitizer for user signature HTML.
 *
 * Signatures are less trusted than "email we display in the reader" — they
 * eventually get injected into outgoing messages, which means they end up
 * inside third-party inboxes. Malicious signature HTML must NOT:
 *   - execute JavaScript in our own webmail (stored XSS),
 *   - phone home to external URLs on load (tracking pixels), or
 *   - carry `data:` URIs that could be used to smuggle payloads.
 *
 * Allowed:
 *   - safe formatting: p / br / div / span / strong / em / u / s / a / ul / ol / li / table / tbody / tr / td / img
 *   - style attribute limited to a small property allowlist
 *   - href (http/https/mailto/tel only)
 *   - img with src exclusively `cid:` (uploaded via /v1/signatures/images) — never external
 *
 * Blocked: script, style, iframe, object, embed, form, meta, base, link,
 * on* handlers, javascript:, vbscript:, data: (blocked entirely — real
 * inline images use CID references + attached parts), position:fixed,
 * position:sticky, expression().
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption',
  'img', 'font', 'small', 'hr',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['style', 'class', 'title', 'lang', 'dir']),
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'valign', 'align', 'width', 'height', 'bgcolor']),
  th: new Set(['colspan', 'rowspan', 'valign', 'align', 'width', 'height', 'bgcolor', 'scope']),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'width', 'align', 'bgcolor']),
  font: new Set(['color', 'face', 'size']),
};

const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'background',
  'font-size', 'font-weight', 'font-style', 'font-family', 'font-variant', 'text-decoration',
  'text-align', 'text-transform', 'letter-spacing', 'line-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'border-color', 'border-style', 'border-width',
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'display', 'vertical-align',
]);

function isSafeHref(url: string): boolean {
  const s = url.trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('javascript:') || s.startsWith('vbscript:') || s.startsWith('data:')) return false;
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('mailto:') ||
    s.startsWith('tel:') ||
    s.startsWith('#') ||
    s.startsWith('/')
  );
}

function isSafeImgSrc(url: string): boolean {
  const s = url.trim();
  // ONLY cid: URIs — signature images are uploaded via /v1/signatures/images
  // and referenced by the CID token we return. This prevents remote image
  // tracking pixels AND prevents smuggled data URIs.
  return s.toLowerCase().startsWith('cid:') && /^[a-z]+:[a-z0-9._-]+$/i.test(s);
}

function sanitizeStyle(raw: string): string {
  return raw
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [k, ...vparts] = d.split(':');
      const value = vparts.join(':').trim();
      if (!k || !value) return null;
      const key = k.trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPS.has(key)) return null;
      const v = value.toLowerCase();
      if (/expression|javascript|vbscript|behavior|url\s*\(\s*['"]?\s*(javascript|data)/.test(v))
        return null;
      if (key === 'position' && (v === 'fixed' || v === 'sticky')) return null;
      return `${key}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * Walk the parsed DOM, mutating in place: strip disallowed elements/attrs,
 * enforce safe href/src, sanitize style.
 */
function walk(nodes: DomChildNode[]): DomChildNode[] {
  const out: DomChildNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'comment' || node.type === 'cdata') {
      if (node instanceof DomText) out.push(node);
      continue;
    }
    if (!(node instanceof DomElement)) continue;
    const tag = node.name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Keep children (skip the wrapper).
      if (node.children?.length) out.push(...walk(node.children as DomChildNode[]));
      continue;
    }
    const kept: Record<string, string> = {};
    for (const [name, value] of Object.entries(node.attribs ?? {})) {
      const attr = name.toLowerCase();
      if (attr.startsWith('on')) continue;
      const allowed =
        ALLOWED_ATTRS['*']!.has(attr) || (ALLOWED_ATTRS[tag]?.has(attr) ?? false);
      if (!allowed) continue;
      if (attr === 'href') {
        if (!isSafeHref(value)) continue;
        kept[attr] = value;
        // Force safe target/rel on outbound links.
        kept['target'] = '_blank';
        kept['rel'] = 'noopener noreferrer';
        continue;
      }
      if (attr === 'src') {
        if (!isSafeImgSrc(value)) continue;
        kept[attr] = value;
        continue;
      }
      if (attr === 'style') {
        const cleaned = sanitizeStyle(value);
        if (cleaned) kept[attr] = cleaned;
        continue;
      }
      kept[attr] = value;
    }
    node.attribs = kept;
    // Walk in place then reassign — the child array is DomChildNode-typed.
    const kids = walk((node.children ?? []) as DomChildNode[]);
    (node as unknown as { children: DomChildNode[] }).children = kids;
    out.push(node);
  }
  return out;
}

export function sanitizeSignatureHtml(input: string): string {
  const handler = new DomHandler();
  const parser = new htmlparser2.Parser(handler, {
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  });
  parser.write(input);
  parser.end();
  const doc = handler.root as DomDocument;
  const cleaned = walk((doc.children ?? []) as DomChildNode[]);
  // dom-serializer's `render` accepts an array of nodes.
  return renderDom(cleaned as unknown as DomChildNode[], {
    encodeEntities: 'utf8',
    selfClosingTags: true,
  });
}

/** Extract the set of CID tokens referenced from the signature body. */
export function collectCidTokens(html: string): string[] {
  const out = new Set<string>();
  const re = /cid:([A-Za-z0-9._-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.add(m[1]!);
  }
  return [...out];
}

/** Pull all img src="cid:…" and return the raw src plus the extracted token. */
export function extractCidImages(html: string): { src: string; token: string }[] {
  const results: { src: string; token: string }[] = [];
  const re = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = (m[1] ?? m[2] ?? '').trim();
    const cid = /^cid:([A-Za-z0-9._-]+)$/i.exec(src);
    if (cid) results.push({ src, token: cid[1]! });
  }
  return results;
}

/** Guard against domutils being unused (tree-shaking would drop it otherwise). */
void domutils;
