import { normalizeText, MAX_TEXT } from './text.js';
import { unzipSync, strFromU8 } from 'fflate';
import { plainMarkup } from './dom-text.js';

function unzipDocument(buffer) {
  let total = 0;
  return unzipSync(new Uint8Array(buffer), { filter: file => {
    total += file.originalSize;
    if (total > 64 * 1024 * 1024) throw new Error('The expanded document exceeds the 64 MB safety limit.');
    return true;
  } });
}

async function readEpub(buffer) {
  const files = unzipDocument(buffer);
  const read = path => {
    if (!files[path]) throw new Error(`This EPUB is missing a required file: ${path}`);
    return strFromU8(files[path]);
  };
  const parse = source => new DOMParser().parseFromString(source, 'application/xml');
  const container = parse(read('META-INF/container.xml'));
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB has no package file.');
  const opf = parse(read(opfPath));
  const manifest = new Map([...opf.querySelectorAll('manifest > item')].map(x => [x.getAttribute('id'), x.getAttribute('href')]));
  const sections = [...opf.querySelectorAll('spine > itemref')].map(x => {
    const href = manifest.get(x.getAttribute('idref'));
    if (!href) return '';
    const path = decodeURIComponent(new URL(href, `https://epub.invalid/${opfPath}`).pathname.slice(1));
    return plainMarkup(read(path));
  });
  return sections.join('\n\n');
}

export async function importDocument(file, onProgress = () => {}) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.');
  const ext = file.name.split('.').at(-1).toLowerCase();
  let text;
  if (['txt', 'md', 'csv'].includes(ext)) text = await file.text();
  else if (['html', 'htm'].includes(ext)) text = plainMarkup(await file.text());
  else if (ext === 'epub') text = await readEpub(await file.arrayBuffer());
  else if (ext === 'docx') {
    const buffer = await file.arrayBuffer();
    unzipDocument(buffer); // Check expansion limits before passing to the parser.
    const mammoth = await import('mammoth/mammoth.browser.js');
    text = (await (mammoth.default || mammoth).extractRawText({ arrayBuffer: buffer })).value;
  } else if (ext === 'pdf') {
    // The compatibility build supplies the modern JS helpers PDF.js needs on
    // older supported Chrome versions, without loading any remote polyfills.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const asset = path => chrome.runtime.getURL(path);
    pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: asset('cmaps/'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts/'),
      wasmUrl: asset('wasm/'), isEvalSupported: false });
    // Reject password prompts with a useful message instead of waiting indefinitely.
    task.onPassword = () => { void task.destroy(); };
    let pdf;
    try {
      pdf = await task.promise;
      const pages = [];
      let count = 0;
      for (let page = 1; page <= pdf.numPages; page++) {
        onProgress(`Reading PDF page ${page} of ${pdf.numPages}…`);
        const handle = await pdf.getPage(page);
        const content = await handle.getTextContent();
        const pageText = content.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('');
        count += pageText.length;
        if (count > MAX_TEXT) throw new Error('This PDF is too long. Split it into smaller sections.');
        pages.push(pageText);
        handle.cleanup();
      }
      text = pages.join('\n\n');
    } catch (error) {
      if (/password|destroyed/i.test(error.message)) throw new Error('This PDF is password protected. Open an unlocked copy.');
      throw error;
    } finally { await task.destroy(); }
  } else throw new Error('Supported files: PDF, EPUB, DOCX, TXT, Markdown, HTML, and CSV.');
  text = normalizeText(text);
  if (!text) throw new Error('No readable text found. Scanned PDFs need OCR first; DRM-protected ebooks are not supported.');
  if (text.length > MAX_TEXT) throw new Error('This document exceeds 600,000 characters. Split it into smaller sections.');
  return { id: crypto.randomUUID(), title: file.name, text, url: '', index: 0, bookmarks: [] };
}
