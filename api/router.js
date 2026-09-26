// api/[...path].mjs — the Vercel serverless entry point.
//
// This is the PROD twin of demo/server.mjs: it adapts Vercel's (req,res) to the same normalized
// shape and calls the SAME app/handlers.mjs, so local and prod cannot drift. It is a catch-all
// function — Vercel routes every /api/* request here and populates req.query.path with the path
// segments after /api. vercel.json also rewrites /bank and /bank/* into /api/bank/* so the bank
// auth wall is same-origin here too (no separate port, no ngrok).
//
// Runtime: Node (NOT edge) — app/attestation.mjs uses node:crypto. Vercel picks Node for .mjs
// functions under /api by default; we keep it explicit in vercel.json.
import { handleRequest } from '../app/handlers.mjs';

export default async function handler(req, res) {
  const q = req.query || {};

  // Reconstruct the LOGICAL pathname from the catch-all segments (the stable, documented source).
  //   /api/world-config        → path=['world-config']        → '/api/world-config'
  //   /api/detail/mei?lender=x  → path=['detail','mei']         → '/api/detail/mei'
  //   /bank/login (rewritten to /api/bank/login) → path=['bank','login'] → '/bank/login'
  const raw = q.path;
  const segs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const pathname = segs[0] === 'bank' ? '/' + segs.join('/') : '/api/' + segs.join('/');

  // Rebuild query params (everything except the catch-all 'path' key).
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (k === 'path') continue;
    if (Array.isArray(v)) v.forEach((x) => searchParams.append(k, x));
    else searchParams.append(k, v);
  }

  // Vercel pre-parses JSON + urlencoded bodies into req.body (an object). Our handler's parseBody
  // takes a STRING and JSON.parse's it first, so re-stringifying an object round-trips cleanly for
  // both the JSON api/* calls and the urlencoded /bank/login form.
  const rawBody = typeof req.body === 'string' ? req.body : (req.body ? JSON.stringify(req.body) : '');

  const out = await handleRequest({
    method: req.method,
    pathname,
    searchParams,
    cookieHeader: req.headers.cookie || '',
    rawBody,
  });

  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.statusCode = out.status;
  res.end(out.body);
}
