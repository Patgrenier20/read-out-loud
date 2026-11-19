// textContent alone joins adjacent block elements in minified HTML (e.g.
// </h1><p>). Add explicit boundaries before extracting inert, plain text.
export function nodeToPlainText(root) {
  root.querySelectorAll('script,style,nav').forEach(node => node.remove());
  root.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,section,article,tr,td,br,blockquote').forEach(node => {
    node.append(root.ownerDocument.createTextNode('\n'));
  });
  return root.textContent || '';
}

export function plainMarkup(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  return nodeToPlainText(doc.body);
}
