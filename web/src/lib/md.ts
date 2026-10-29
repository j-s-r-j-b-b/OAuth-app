import { Marked, type Tokens } from 'marked';

/**
 * Guide text is written by an LLM that read untrusted web pages, so rendering is
 * strict: raw HTML is escaped and only http(s)/mailto/relative links survive.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeHref = (h: string) => (/^(https?:|mailto:|\/(?!\/)|#)/i.test(h.trim()) ? h.trim() : null);

const marked = new Marked({
  gfm: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return esc(token.text);
    },
    link(this: any, token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      const href = safeHref(token.href);
      return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
    },
    image(token: Tokens.Image) {
      const href = safeHref(token.href);
      return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(token.text || href)}</a>` : esc(token.text);
    },
  },
});

export const renderMd = (s: string) => marked.parse(s, { async: false }) as string;
export const renderInline = (s: string) => marked.parseInline(s, { async: false }) as string;
