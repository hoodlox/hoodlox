// Vercel serverless entry: vercel.json rewrites every /api/<path> here as /api?p=<path>, and the game
// router takes it from there.
import { handle } from '../server/routes.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.searchParams.has('p') ? `/api/${url.searchParams.get('p')}` : url.pathname;
  const { status, body } = await handle({ method: req.method, path, headers: req.headers, body: req.body });
  res.status(status).setHeader('cache-control', 'no-store').json(body);
}
