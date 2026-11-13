const { sql, readBody, send, guard, requireAuth, currencyOfPhone, moneyRules, depositFloorFor } = require('../../_lib');

// Manual MoMo deposit — RESTORED 2026-11-13 (Prince: take the
// automatic PayPulse gateway off, put manual back). New submissions
// are accepted again; the super admin reviews each one in the
// Deposits queue before the wallet is credited. The automatic
// gateway is off at the operator_settings switch instead of by
// deleting its code, so it can come back later.
module.exports = guard(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { amount_ghs, sender_phone, sender_name, external_ref, proof_image } = await readBody(req);
  const amount = Number(amount_ghs);
  const urows = await sql('select phone, role from users where id = $1', [auth.uid]);
  const currency = urows.length ? currencyOfPhone(urows[0].phone) : 'GHS';
  const rules = moneyRules(currency);
  const floor = depositFloorFor(urows[0], currency);
  if (!(amount >= floor)) return send(res, 400, { error: 'invalid_amount', detail: `Minimum deposit is ${rules.symbol}${floor.toLocaleString('en-GB')}.` });
  if (!external_ref || String(external_ref).trim().length < 4) return send(res, 400, { error: 'transaction_id_required', detail: 'Enter the transaction ID from your MoMo payment.' });
  const name = String(sender_name || '').trim().slice(0, 80);
  if (name.length < 2) return send(res, 400, { error: 'sender_name_required', detail: 'Enter the name on the MoMo account you paid from.' });
  const phone = String(sender_phone || '').replace(/\D/g, '').slice(0, 15);
  if (phone.length < 9) return send(res, 400, { error: 'sender_phone_required', detail: 'Enter the MoMo number you paid from.' });
  // Optional transaction screenshot (Prince's ask, 2026-11-03): a
  // data-URL image the client shrank to at most 1280px. Stored on
  // the row so the reviewing admin can open it from the queue.
  // (The current player UI only previews it and never sends it.)
  let proof = null;
  if (proof_image) {
    if (typeof proof_image !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(proof_image) || proof_image.length > 3800000) {
      return send(res, 400, { error: 'invalid_proof', detail: 'That screenshot could not be read — try a smaller image.' });
    }
    proof = proof_image;
  }
  const meta = { sender_name: name, sender_phone: phone };
  const rows = await sql(
    `insert into wallet_transactions (user_id, kind, method, amount_ghs, status, external_ref, note, proof_image, payout_meta)
     values ($1, 'deposit', $6, $2, 'pending', $3, $4, $5, $7::jsonb)
     returning id, status, created_at`,
    [auth.uid, amount, String(external_ref).trim().slice(0, 80), `sender ${name} · ${phone}`, proof, currency === 'NGN' ? 'Bank transfer (manual)' : 'Telecel Cash (manual)', JSON.stringify(meta)]
  );
  send(res, 201, { transaction: rows[0] });
});
