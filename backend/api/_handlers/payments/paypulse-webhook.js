// PayPulse webhook — the settlement source of truth for MoMo deposits
// (Prince, 2026-11-13; replaces the retired ShinobiPay webhook).
//
// Trust rules (from the PayPulse docs, followed exactly):
//  1. Verify the HMAC-SHA256 signature against the RAW request bytes
//     before trusting anything. The header X-PayPulse-Signature holds
//     the plain hex digest of the raw body keyed by the app's webhook
//     secret. Re-serialised JSON never matches.
//  2. Idempotent on payment_ref + event — delivery is at-least-once.
//     (PayPulse sends no event id, so the pair is the dedup key.)
//  3. On payment.success, credit through settlePayPulseAttempt only
//     when the webhook amount equals the attempt amount to the pesewa.
//     Credit happens exactly once, in one statement, for exactly the
//     requested amount. There is no re-verify GET: PayPulse documents
//     no status endpoint, so the signed webhook IS the authoritative
//     confirmation.
//  4. If the webhook secret is not configured yet, answer 503 so
//     PayPulse keeps retrying instead of us processing unverified
//     events.
const crypto = require('crypto');
const { sql, send, paypulseConfig, ensurePaymentTables, settlePayPulseAttempt } = require('../../_lib');

function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header).trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const { webhookSecret } = paypulseConfig();
  if (!process.env.DATABASE_URL || !webhookSecret) return send(res, 503, { error: 'webhook_not_configured' });
  let eventId = '';
  try {
    const raw = await readRawBody(req);
    if (!verifySignature(raw, req.headers['x-paypulse-signature'], webhookSecret)) {
      return send(res, 401, { error: 'invalid_signature' });
    }
    const event = JSON.parse(raw || '{}');
    const data = event.data || {};
    await ensurePaymentTables();

    // Idempotency: a second delivery of the same event is a no-op.
    eventId = 'paypulse:' + String(data.payment_ref || '') + ':' + String(event.event || '');
    const seen = await sql(
      `insert into webhook_events (event_id) values ($1) on conflict (event_id) do nothing returning event_id`,
      [eventId]
    );
    if (!seen.length) return send(res, 200, { ok: true, duplicate: true });

    const rows = await sql(
      `select id, user_id, reference, intent_id, amount_ghs, amount_minor, network, status
       from payment_attempts where reference = $1 or intent_id = $2`,
      [String(data.merchant_reference || ''), String(data.payment_ref || '')]
    );
    if (!rows.length) return send(res, 200, { ok: true, unmatched: true });
    const attempt = rows[0];

    if (event.event === 'payment.success') {
      // Credit through the shared settler (exactly the attempt's
      // amount, exactly once). An amount mismatch is never stranded
      // behind a silent 200: drop the idempotency record so
      // PayPulse's redelivery is processed fresh, and answer 500 so
      // it actually retries on its backoff.
      const result = await settlePayPulseAttempt(attempt, Number(data.amount));
      if (result === 'unverified') {
        await sql(`delete from webhook_events where event_id = $1`, [eventId]);
        return send(res, 500, { error: 'verification_failed' });
      }
      return send(res, 200, { ok: true, credited: result === 'credited' });
    }

    if (event.event === 'payment.failed') {
      await sql(`update payment_attempts set status = 'failed' where id = $1 and status <> 'succeeded'`, [attempt.id]);
      return send(res, 200, { ok: true });
    }

    return send(res, 200, { ok: true, ignored: event.event || null });
  } catch (e) {
    // A 500 makes PayPulse retry on its backoff schedule — right for
    // transient failures (database blip). Drop the idempotency record
    // so the redelivery is processed fresh instead of being dropped
    // as a duplicate of a failed attempt.
    if (eventId) {
      try { await sql(`delete from webhook_events where event_id = $1`, [eventId]); } catch (ignored) { /* best effort */ }
    }
    if (!res.writableEnded) send(res, 500, { error: 'webhook_error' });
  }
};

// Exported for the local signature unit test only.
module.exports.verifySignature = verifySignature;
