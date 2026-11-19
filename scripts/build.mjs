import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

// All executable code is bundled locally: Manifest V3 forbids remote scripts.
await mkdir('dist', { recursive: true });
await cp('extension', 'dist', { recursive: true });
await build({
  entryPoints: ['src/background.js', 'src/sidepanel.js', 'src/extract.js'],
  outdir: 'dist', bundle: true, format: 'esm', target: 'chrome116',
  sourcemap: true, logLevel: 'info',
});
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
await cp('node_modules/pdfjs-dist/cmaps', 'dist/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', 'dist/standard_fonts', { recursive: true });
await cp('node_modules/pdfjs-dist/wasm', 'dist/wasm', { recursive: true });
await cp('node_modules/pdfjs-dist/LICENSE', 'dist/PDFJS-LICENSE');
await cp('node_modules/@mozilla/readability/LICENSE.md', 'dist/READABILITY-LICENSE');
await cp('PRIVACY.md', 'dist/PRIVACY.md');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = ['THIRD-PARTY SOFTWARE LICENSES\n'];
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || metadata.dev) continue;
  try {
    const pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
    notices.push(`\n${pkg.name} ${pkg.version} (${pkg.license || 'see license text'})\n`);
    for (const file of await readdir(path)) {
      if (/^(licen[cs]e|copying|notice)(\.|$)/i.test(file)) {
        notices.push(await readFile(`${path}/${file}`, 'utf8'));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // Optional platform packages may be absent.
  }
}
await writeFile('dist/THIRD-PARTY-LICENSES.txt', notices.join('\n'));
console.log('Ready: load the dist folder as an unpacked Chrome extension.');
