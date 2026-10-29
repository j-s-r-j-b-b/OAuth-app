import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { composioEnabled, fetchViaComposio } from '../composio.ts';
import { safeGet } from '../net.ts';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'form'] as unknown as TurndownService.Filter);

export type Page = { url: string; finalUrl: string; title: string; text: string; via: 'direct' | 'composio'; status: number };

export function htmlToText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || $('h1').first().text() || '').trim().replace(/\s+/g, ' ');
  $('script, style, noscript, iframe, svg, nav, footer, header, aside, [role="navigation"], [aria-hidden="true"]').remove();
  const main = $('main').first().html() || $('article').first().html() || $('[role="main"]').first().html() || $('body').html() || '';
  const text = turndown
    .turndown(main)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[([^\]]*)\]\((?:javascript|data):[^)]*\)/g, '$1')
    .trim();
  return { title, text };
}

/**
 * Read a page for the agent: direct GET first (fast, free); fall back to Composio's
 * extractor when the page is JS-rendered, blocked, or not HTML.
 */
export async function readPage(url: string, maxChars = 14000): Promise<Page> {
  let direct: Page | null = null;
  let directError = '';
  try {
    const r = await safeGet(url);
    if (r.status < 400 && /html|text\/plain|markdown|json/.test(r.contentType)) {
      const { title, text } = /html/.test(r.contentType) ? htmlToText(r.body) : { title: url, text: r.body };
      direct = { url, finalUrl: r.finalUrl, title: title || url, text: text.slice(0, maxChars), via: 'direct', status: r.status };
    } else {
      directError = `HTTP ${r.status} ${r.contentType}`;
    }
  } catch (e) {
    directError = (e as Error).message;
  }
  // Thin pages are usually client-rendered shells.
  if (direct && direct.text.length > 1200) return direct;
  if (composioEnabled()) {
    try {
      const c = await fetchViaComposio(url, maxChars);
      if (c && c.text.length > (direct?.text.length ?? 0)) {
        return { url, finalUrl: url, title: c.title || direct?.title || url, text: c.text.slice(0, maxChars), via: 'composio', status: 200 };
      }
    } catch (e) {
      directError ||= (e as Error).message;
    }
  }
  if (direct) return direct;
  throw new Error(`Could not read ${url}: ${directError || 'no content'}`);
}
