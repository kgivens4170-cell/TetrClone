// Builds a single self-contained page (scripts inlined, no <html>/<head>/<body>) from web/index.html.
// Usage: node tools/build-artifact.js <out.html>
const fs = require('fs'), path = require('path');
const web = path.join(__dirname, '..', 'web');
let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
let body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, f) =>
  '<script>\n' + fs.readFileSync(path.join(web, f), 'utf8').replace(/<\/script>/g, '<\\/script>') + '\n</script>');
fs.writeFileSync(process.argv[2], head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', process.argv[2], fs.statSync(process.argv[2]).size, 'bytes');
