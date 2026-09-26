// MaruMaru local demo server — a THIN wrapper over app/handlers.mjs.
//
// It does two things only: (1) serve the static front-end from demo/, and (2) adapt Node's
// (req,res) to the normalized request shape handleRequest() expects. ALL dynamic route logic
// (World ID, the bank auth wall at /bank/*, attestation, issue, lender, agent) lives in
// app/handlers.mjs — the SAME module the Vercel function (api/[...path].mjs) calls, so local and
// prod can't drift. Event-day, the same endpoints point at the deployed registrar (THE_GUIDE §3).
import 'dotenv/config';   // load .env so `npm run demo` picks up WORLD_ID_MODE=real + creds (no manual export)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../app/handlers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8788;

function readBody(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- static front-end (served by the host, not the handler) ----
  if (req.method === 'GET' && (p === '/' || p.endsWith('.html') || p.endsWith('.css') || p.endsWith('.js'))) {
    const file = p === '/' ? 'index.html' : p.slice(1);
    const fp = path.join(__dirname, file);
    if (fs.existsSync(fp)) {
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
      res.writeHead(200, { 'content-type': type }); res.end(fs.readFileSync(fp)); return;
    }
  }

  // ---- everything else → the shared handler ----
  const rawBody = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : '';
  const out = await handleRequest({
    method: req.method,
    pathname: p,
    searchParams: url.searchParams,
    cookieHeader: req.headers.cookie || '',
    rawBody,
  });
  res.writeHead(out.status, out.headers);
  res.end(out.body);
});

server.listen(PORT, () => console.log(`MaruMaru demo on http://localhost:${PORT}  (bank auth wall at /bank)`));
