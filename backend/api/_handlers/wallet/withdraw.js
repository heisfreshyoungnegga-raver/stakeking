const { sql, readBody, send, guard, requireAuth, ensureAdminTables, ensurePaymentTables, getSettings, currencyOfPhone } = require('../../_lib');

// Withdrawal request: the balance is held immediately, and the database
// trigger refuses the insert until the user reaches the required number
// of completed deposits. Admin rejection refunds the hold automatically.
module.exports = guard(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const auth = requireAuth(req, res);
  if (!auth) return;
  await ensureAdminTables();
  const settings = await getSettings(['payouts_frozen']);
  if (settings.payouts_frozen === '1') {
    return send(res, 403, { error: 'payouts_frozen', detail: 'Withdrawals are temporarily paused by the operator. Please check back shortly.' });
  }
  const body = await readBody(req);
  const { amount_ghs, method } = body;
  const amount = Number(amount_ghs);
  if (!(amount > 0)) return send(res, 400, { error: 'invalid_amount' });
  // Nigerian accounts are paid by bank transfer through Flutterwave
  // (Prince, 2026-11-07): the bank details ride on the transaction row
  // so the super admin's confirm can fire the transfer. Ghana accounts
  // keep paying out to MoMo exactly as before.
  await ensurePaymentTables();
  const urows = await sql('select phone from users where id = $1', [auth.uid]);
  const isNgn = urows.length && currencyOfPhone(urows[0].phone) === 'NGN';
  let payoutMeta = null;
  let methodLabel = method ? String(method).slice(0, 40) : 'MTN MoMo';
  if (isNgn) {
    const bankCode = String(body.bank_code || '').trim();
    const bankName = String(body.bank_name || '').trim().slice(0, 80);
    const acctNum = String(body.account_number || '').replace(/\D/g, '');
    const acctName = String(body.account_name || '').trim().slice(0, 80);
    if (!bankCode || !bankName || acctNum.length !== 10 || !acctName) {
      return send(res, 400, { error: 'bank_details_required', detail: 'Pick your bank and enter the 10-digit account number so we can pay you.' });
    }
    payoutMeta = { currency: 'NGN', bank_code: bankCode, bank_name: bankName, account_number: acctNum, account_name: acctName };
    methodLabel = 'Bank transfer';
  }
  // Ghana payouts are manual (Prince, 2026-11-12): the player names the
  // MoMo number and the name on the receiving account, and both ride to
  // the super admin with the request so the payout can be matched by
  // hand. The request's own row id is its transaction reference.
  let payoutNote = null;
  if (!isNgn) {
    const momoNumber = String(body.account_number || body.momo_number || '').replace(/\D/g, '').slice(0, 15);
    const accountName = String(body.sender_name || body.account_name || '').trim().slice(0, 80);
    if (momoNumber.length >= 9 && accountName.length >= 2) {
      payoutMeta = { currency: 'GHS', method: methodLabel, momo_number: momoNumber, account_name: accountName };
      payoutNote = `payout ${accountName} · ${momoNumber}`;
    }
  }
  // ceiling is balance minus the bonus bucket.
  const urow = await sql('select balance_ghs, bonus_ghs from users where id = $1', [auth.uid]);
  const bonusHeld = urow.length ? Number(urow[0].bonus_ghs || 0) : 0;
  if (bonusHeld > 0) {
    const realBal = Math.round(((urow.length ? Number(urow[0].balance_ghs || 0) : 0) - bonusHeld) * 100) / 100;
    if (amount > realBal) {
      return send(res, 400, { error: 'bonus_not_withdrawable', detail: 'Bonus money can be staked but not withdrawn. Your withdrawable balance is ' + realBal.toFixed(2) + '.' });
    }
  }
  let rows;
  try {
    rows = await sql(
      `with bal as (
         update users set balance_ghs = balance_ghs - $2
         where id = $1 and balance_ghs >= $2
         returning id
       )
       insert into wallet_transactions (user_id, kind, method, amount_ghs, status, payout_meta, note)
       select $1, 'withdrawal', $3, -$2, 'pending', $4::jsonb, $5 from bal
       returning id, status, created_at`,
      [auth.uid, amount, methodLabel, payoutMeta ? JSON.stringify(payoutMeta) : null, payoutNote]
    );
  } catch (e) {
    if (String(e.dbMessage || '').includes('withdrawal locked')) {
      // The trigger reports "withdrawal locked: X of Y required
      // deposit total completed" (Prince, 2026-11-09: withdrawals
      // unlock once a player's completed deposits total GHS 600).
      // The client gets the plain rule plus the player's progress.
      const cm = /([\d.]+) of ([\d.]+)/.exec(e.dbMessage || '');
      const done = cm ? Number(cm[1]) : 0;
      const required = cm ? Number(cm[2]) : 600;
      return send(res, 403, {
        error: 'withdrawal_locked',
        detail: 'Withdrawals unlock once your completed deposits reach GHS ' + required.toFixed(2) + '. You have deposited GHS ' + done.toFixed(2) + ' so far.',
        deposits_total_ghs: done,
        deposits_required_ghs: required,
      });
    }
    throw e;
  }
  if (!rows.length) return send(res, 400, { error: 'insufficient_balance' });
  send(res, 201, { transaction: rows[0] });
});
