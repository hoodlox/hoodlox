// Production rehearsal without Vercel: serves dist/ like vercel.json does (static files, /play
// rewrite) and runs the real api/index.js handler with a Vercel-like req/res. Run with
// NODE_ENV=production and the production env vars to check the build and the config together.
// usage: PORT=5190 node tools/serve-dist.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import handler from '../api/index.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    req.body = raw ? JSON.parse(raw) : undefined;
    res.status = (s) => { res.statusCode = s; return res; };
    res.json = (b) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)); return res; };
    return handler(req, res);
  }
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/play') path = '/map.html';
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join('dist', normalize(path)));
    res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end('not found'); }
}).listen(+(process.env.PORT ?? 5190), () => console.log('serving dist on', process.env.PORT ?? 5190));
