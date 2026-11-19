import { Readability } from '@mozilla/readability';
import { plainMarkup, nodeToPlainText } from './dom-text.js';

// Executed only after an explicit click, using Chrome's temporary activeTab grant.
(() => {
  const selected = window.getSelection()?.toString().trim();
  const article = selected ? null : new Readability(document.cloneNode(true)).parse();
  let text = selected || (article?.content ? plainMarkup(article.content) : '');
  if (!text?.trim()) {
    const root = document.querySelector('article, main, [role="main"]') || document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script,style,nav,header,footer,aside,button,form,[aria-hidden="true"]').forEach(x => x.remove());
    text = nodeToPlainText(clone);
  }
  // Plain text only crosses the extension boundary; article markup is never rendered.
  globalThis.__readOutLoudArticle = { title: selected ? `Selection · ${document.title}` : article?.title || document.title,
    text: (text || '').trim(), url: location.href, lang: document.documentElement.lang || '' };
})();
