// Dev: the game API runs inside the Vite server (same router as Vercel, PGlite instead of Neon).
// Build: every HTML page is an entry.
import { defineConfig } from 'vite';
import { existsSync, createReadStream } from 'node:fs';
import { extname } from 'node:path';

process.env.ALLOW_TEST_KNOBS ??= '1';

// Dev-only assets (kit viewer, Synty manor: licensed, never deployed) live in dev-assets/ and are
// served at /kit and /manor by the dev server only.
const devAssets = () => ({
  name: 'dev-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Same rewrites as vercel.json.
      if (req.url === '/play' || req.url.startsWith('/play?')) req.url = req.url.replace('/play', '/map.html');
      if (req.url === '/docs' || req.url.startsWith('/docs#')) req.url = '/docs.html';
      const path = decodeURIComponent(req.url.split('?')[0]);
      if (!/^\/(kit|manor)\//.test(path) || path.includes('..')) return next();
      const file = `dev-assets${path}`;
      if (!existsSync(file)) return next();
      res.setHeader('content-type', { '.json': 'application/json', '.png': 'image/png', '.gltf': 'model/gltf+json' }[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    });
  },
});

const api = () => ({
  name: 'treasurehunt-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      // Loaded through Vite so edits to server/ apply without a restart.
      const { handle } = await server.ssrLoadModule('/server/routes.js');
      const url = new URL(req.url, 'http://x');
      const { status, body } = await handle({ method: req.method, path: url.pathname, headers: req.headers, body: raw ? JSON.parse(raw) : {} });
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    });
  },
});

export default defineConfig({
  plugins: [devAssets(), api()],
  server: { watch: { ignored: ['**/.data/**', '**/shots/**'] } },
  build: {
    rollupOptions: { input: { index: 'index.html', map: 'map.html', docs: 'docs.html' } },
  },
});
