const { send } = require('../_lib');
const gotrue = require('./gotrue');
const postgrest = require('./postgrest');
const rpc = require('./rpc');

// Adapter entry point. Mounted by server.js for /auth/v1/* and
// /rest/v1/* — the two surfaces the frontend's Supabase client uses.
// Auth (gotrue.js), the table surface (postgrest.js) and the RPC
// dispatcher (rpc.js) are all live.

module.exports = async (req, res) => {
  const path = String((req.url || '').split('?')[0]);
  if (path.startsWith('/auth/v1/')) return gotrue(req, res);
  if (path.startsWith('/rest/v1/rpc/')) return rpc(req, res);
  if (path.startsWith('/rest/v1/')) return postgrest(req, res);
  return send(res, 404, { error: 'not_found' });
};
