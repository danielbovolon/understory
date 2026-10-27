// Builds self-contained single-file versions of the app:
//   dist/understory.html  full HTML document, runs from any web server
//   dist/artifact.html    page content without the document skeleton (for claude.ai artifacts)
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');
const engine = read('js/engine.js'), sim = read('js/sim.js'), app = read('js/app.js'), css = read('css/understory.css');
for (const [n, s] of [['engine', engine], ['sim', sim], ['app', app]]) if (/<\/script/i.test(s)) throw new Error(n + '.js contains </script');
const meta = html.slice(html.indexOf('<title>'), html.indexOf('<link rel="stylesheet" href="css/'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="js/sim.js">')).trim();
const head = `${meta.trim()}\n<style>\n${css}\n</style>`;
const scripts = `<script type="text/plain" id="engine-src">\n${engine}\n</script>\n<script>\n${sim}\n</script>\n<script>\n${app}\n</script>`;
const out = new URL('../dist/', import.meta.url); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(new URL('artifact.html', out), `${head}\n${body}\n${scripts}\n`);
fs.writeFileSync(new URL('understory.html', out), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n${scripts}\n</body>\n</html>\n`);
console.log('dist/understory.html', fs.statSync(new URL('understory.html', out)).size, 'bytes');
console.log('dist/artifact.html  ', fs.statSync(new URL('artifact.html', out)).size, 'bytes');
