// Tiny static server for local testing: node scripts/serve.mjs [port] [delayMs]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('../site/', import.meta.url).pathname;
const port = +process.argv[2] || 8080, delay = +process.argv[3] || 0;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    const big = /\.(hdr|glb|woff2)$/.test(file);
    setTimeout(() => { res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body); }, big ? delay : delay / 4);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}  (delay ${delay} ms)`));
