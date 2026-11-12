const { sql, send, guard, requireAdmin } = require('../../_lib');

module.exports = guard(async (req, res) => {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  // The approval queue is super-admin only (Prince, 2026-11-05 for
  // withdrawals; extended to deposits 2026-11-12 with the manual-only
  // switch: the transaction ID and sender's name go to the super admin
  // for approval on both). The filter is here, server-side, so the
  // data itself never reaches a regular admin's browser.
  if (auth.role !== 'super_admin') return send(res, 200, { queue: [] });
  const rows = await sql(
    `select wt.id, wt.user_id, u.phone, wt.kind, wt.method, wt.amount_ghs,
            wt.external_ref, wt.note, wt.created_at, (wt.proof_image is not null) as has_proof,
            wt.payout_meta
     from wallet_transactions wt join users u on u.id = wt.user_id
     where wt.status = 'pending' and wt.kind in ('deposit', 'withdrawal')
     order by wt.created_at asc`
  );
  send(res, 200, { queue: rows.map(r => ({ ...r, amount_ghs: Number(r.amount_ghs) })) });
});
