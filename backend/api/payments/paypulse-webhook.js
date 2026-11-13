// PayPulse webhook — exact route file so Vercel keeps the raw body
// stream intact for signature verification (same pattern as the old
// ShinobiPay route file it replaces).
const handler = require('../_handlers/payments/paypulse-webhook');

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
