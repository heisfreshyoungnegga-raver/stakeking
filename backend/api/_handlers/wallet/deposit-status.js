const { sql, send, guard, requireAuth, ensurePaymentTables } = require('../../_lib');

// Status for one of the signed-in customer's own MoMo deposit attempts.
// PayPulse documents no status or verify endpoint, so unlike the old
// ShinobiPay reconciler this handler cannot ask the provider for the
// live state — it reports the attempt row the signed webhook maintains.
// The player's waiting screen polls this; the webhook remains the only
// path that credits a wallet.
module.exports = guard(async (req, res) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const reference = String((req.query && req.query.reference) || '');
  if (!reference) return send(res, 400, { error: 'reference_required' });
  await ensurePaymentTables();
  const rows = await sql(
    `select id, user_id, reference, intent_id, amount_ghs, amount_minor, network, status from payment_attempts where reference = $1 and user_id = $2`,
    [reference, auth.uid]
  );
  if (!rows.length) return send(res, 404, { error: 'attempt_not_found' });
  const a = rows[0];
  send(res, 200, { reference, status: a.status, network_status: null, amount_ghs: Number(a.amount_ghs) });
});
