const crypto = require('crypto');
const { sql, readBody, send, guard, requireAuth, paypulseConfig, paypulseFetch, detectNetwork, ensurePaymentTables, ensureAdminTables, getSettings } = require('../../_lib');

// Instant MoMo deposit (PayPulse hosted checkout, Prince 2026-11-13 —
// replaces the retired ShinobiPay direct push): create a payment,
// PayPulse returns a checkout_url, and the player approves the USSD
// prompt on their phone. This handler NEVER credits the wallet —
// settlement happens only through settlePayPulseAttempt in _lib.js,
// driven by the signed PayPulse webhook (the docs list no status or
// verify endpoint, so there is no reconciler GET to fall back on).
// Amounts: PayPulse speaks GHS decimals (100.00), our attempt rows
// keep integer pesewas. The wallet is later credited exactly the
// requested amount — the webhook's amount must match it to the pesewa.
module.exports = guard(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (!paypulseConfig().secretKey) return send(res, 503, { error: 'provider_not_configured' });
  await ensureAdminTables();
  const settings = await getSettings(['gateway_enabled']);
  if (settings.gateway_enabled === '0') return send(res, 503, { error: 'gateway_disabled', detail: 'Instant deposits are switched off right now.' });

  const { amount_ghs, phone, network } = await readBody(req);
  const amount = Number(amount_ghs);
  if (!(amount >= 200) || amount > 5000) return send(res, 400, { error: 'invalid_amount', detail: 'Enter an amount between GHS 200 and GHS 5,000.' });
  const amountMinor = Math.round(amount * 100);
  if (Math.abs(amount * 100 - amountMinor) > 0.001) return send(res, 400, { error: 'invalid_amount', detail: 'Amount must be in whole pesewas.' });

  // Normalise the phone to international form (233...) for the API, and
  // keep the local form (0...) for prefix-based network detection.
  // PayPulse auto-detects the network from the number itself; the
  // network we record is only a default for the receipt.
  const digits = String(phone || '').replace(/[\s+]/g, '');
  const local = digits.startsWith('233') ? '0' + digits.slice(3) : digits;
  if (!/^0\d{9}$/.test(local)) return send(res, 400, { error: 'invalid_phone', detail: 'Enter a valid Ghana phone number.' });
  const intl = '233' + local.slice(1);

  let net = String(network || '').toUpperCase();
  if (!['MTN', 'TELECEL', 'AIRTELTIGO'].includes(net)) net = detectNetwork(local) || '';
  if (!net) return send(res, 400, { error: 'invalid_network', detail: 'Pick the network for that number.' });

  await ensurePaymentTables();
  // Anti-storm guard (Prince, 2026-11-09, kept for PayPulse): rapid
  // retries collide with a prompt already in flight and keep a
  // provider-side block alive. Refuse early, WITHOUT poking the
  // provider, when this number already has a prompt in flight or was
  // blocked within the last 30 minutes.
  const lastTry = await sql(
    `select status, fail_reason, created_at from payment_attempts
     where phone = $1 order by created_at desc limit 1`,
    [intl]
  );
  if (lastTry.length) {
    const ageMin = (Date.now() - new Date(lastTry[0].created_at).getTime()) / 60000;
    if ((lastTry[0].status === 'awaiting' || lastTry[0].status === 'created') && ageMin < 10) {
      return send(res, 409, { error: 'payment_in_progress', detail: 'A payment prompt is already waiting for this number — approve it on the phone, or wait a few minutes for it to expire before trying again.' });
    }
    if (lastTry[0].fail_reason === 'number_blocked' && ageMin < 30) {
      return send(res, 429, { error: 'number_blocked', detail: 'This phone number is temporarily blocked by the payment provider. Please wait about 30 minutes before trying again — repeated tries can extend the block.' });
    }
  }
  // One attempt row per try. Its reference is the merchant_reference
  // PayPulse echoes back in the webhook, so the webhook can always
  // find this row; the payment_ref it returns lands in intent_id.
  const reference = 'dep_' + crypto.randomUUID().replace(/-/g, '');
  const attemptRows = await sql(
    `insert into payment_attempts (user_id, provider, reference, amount_ghs, amount_minor, phone, network, status)
     values ($1, 'paypulse', $2, $3, $4, $5, $6, 'created') returning id`,
    [auth.uid, reference, amountMinor / 100, amountMinor, intl, net]
  );
  const attemptId = attemptRows[0].id;

  let created;
  try {
    created = await paypulseFetch('/api/v1/payments.php', {
      method: 'POST',
      body: {
        amount: amountMinor / 100,
        currency: 'GHS',
        // The docs name this merchant_reference, but the live API's
        // validator requires `reference` (422, 2026-11-13) — send
        // both with the same value; the webhook echoes it back as
        // merchant_reference either way.
        reference,
        merchant_reference: reference,
        description: 'StakeKing wallet deposit',
        customer: { phone: local },
        return_url: 'https://stakeskings.com/deposit?paypulse=return&ref=' + reference,
        webhook_url: 'https://stakeking-api.vercel.app/api/payments/paypulse-webhook'
      }
    });
  } catch (e) {
    // Network failure mid-create: the payment may or may not exist.
    // Mark the attempt unknown and tell the customer to wait — never
    // blindly create a second charge.
    await sql(`update payment_attempts set status = 'unknown' where id = $1`, [attemptId]);
    return send(res, 202, { reference, status: 'unknown', detail: 'We could not confirm the payment request. If a prompt arrives, approve it once — do not pay twice.' });
  }

  const p = (created.data && created.data.payment) || {};
  // Live shape (2026-11-13) names the payment ref `reference`, not
  // the documented `payment_ref` — accept either. checkout_url and
  // expires_at match the docs.
  const paymentRef = p.payment_ref || p.reference;
  if ((created.status === 201 || created.status === 200) && p.checkout_url && paymentRef) {
    await sql(
      `update payment_attempts set intent_id = $2, status = 'awaiting' where id = $1`,
      [attemptId, String(paymentRef)]
    );
    return send(res, 201, {
      reference,
      status: 'awaiting',
      checkout_url: p.checkout_url,
      payment_ref: String(paymentRef),
      expires_at: p.expires_at || null,
      fee_ghs: typeof p.fee === 'number' ? p.fee : null,
      credit_ghs: amountMinor / 100
    });
  }

  const code = ((created.data && created.data.error) || 'payment_failed');
  // A provider HTML page (the PayPulse bot challenge) must never reach
  // the player's toast as raw markup — it reads as gibberish and alarm
  // (seen live on Onelord's phone, 2026-11-13). The solver in _lib.js
  // handles the known challenge; if it still comes back, the player
  // gets a plain retry message. The attempt row keeps the marker so
  // the failure mode stays diagnosable (challenge vs plain error,
  // and whether the solver ran).
  const challenged = !!created.challenged;
  let message = (created.data && (created.data.message || created.data.error_description)) || '';
  if (!message) {
    message = challenged
      ? 'PayPulse is not answering right now — please try again in a few minutes.'
      : ('PayPulse answered HTTP ' + created.status + (created.raw ? ' — ' + created.raw : '') + '. The payment could not be started.');
  }
  const failMark = challenged ? code + (created.solved ? ':challenge_after_solve' : ':challenge_http_' + created.status) : code;
  await sql(`update payment_attempts set status = 'failed', fail_reason = $2 where id = $1`, [attemptId, String(failMark).slice(0, 120)]);
  return send(res, created.status >= 400 && created.status < 500 ? created.status : 402, { error: String(code), detail: message, reference });
});
