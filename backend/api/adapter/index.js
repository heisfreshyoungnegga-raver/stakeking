const { send } = require('../_lib');
const gotrue = require('./gotrue');
const postgrest = require('./postgrest');
const rpc = require('./rpc');

// Adapter entry point. Mounted by server.js for /auth/v1/* and
// /rest/v1/* — the two surfaces the frontend's Supabase client uses.
// Auth (gotrue.js), the table surface (postgrest.js) and the RPC
// dispatcher (rpc.js) are all live.

module.exports = async (req, res) => {
  let path = String((req.url || '').split('?')[0]);
  // On Vercel the /auth/v1/* and /rest/v1/* surfaces reach this handler
  // either through catch-all route files (req.url stays original) or
  // through vercel.json rewrites that carry the original path in the
  // __sk query param. Normalise both; downstream handlers then see the
  // original path + query exactly as the Railway mount presents them.
  try {
    const raw = String(req.url || '');
    const qs = new URLSearchParams(raw.split('?')[1] || '');
    const sk = qs.get('__sk');
    if (sk) {
      path = sk;
      qs.delete('__sk');
      const rest = qs.toString();
      req.url = sk + (rest ? '?' + rest : '');
    }
  } catch (_) { /* keep the raw path */ }
  if (path.startsWith('/auth/v1/')) return gotrue(req, res);
  if (path.startsWith('/rest/v1/rpc/')) return rpc(req, res);
  if (path.startsWith('/rest/v1/')) return postgrest(req, res);
  return send(res, 404, { error: 'not_found' });
};
