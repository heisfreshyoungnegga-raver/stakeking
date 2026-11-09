import { assertIntentMatches, eventAmountMatchesIntent, shinobiIntentSchema } from "./shinobipay-contract";
import { shinobiEventSchema, verifyShinobiSignature } from "./shinobipay-verification";

// Both request creation and webhook processing remain independently live-locked.
export const SHINOBIPAY_LIVE_PROCESSING = false;

export class PaymentConfirmationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Deposit = { reference: string; amount_minor: number; mode: string; intent_id: string | null };
export type ConfirmationDependencies = {
  secret: string;
  accountMode: () => Promise<"test" | "live">;
  findDeposit: (reference: string) => Promise<Deposit | null>;
  retrieveIntent: (id: string) => Promise<unknown>;
  record: (event: { _event: string; _intent: string; _reference: string; _amount: number; _status: string; _sequence: number }) => Promise<string>;
};

// No dependency is called before authenticating the original raw bytes.
export async function confirmShinobiPayment(raw: string, signature: string | null, deps: ConfirmationDependencies) {
  if (new TextEncoder().encode(raw).length > 65536) throw new PaymentConfirmationError("Payload too large", 413);
  if (!await verifyShinobiSignature(raw, signature, deps.secret)) throw new PaymentConfirmationError("Invalid signature", 401);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new PaymentConfirmationError("Invalid JSON", 400); }
  const parsed = shinobiEventSchema.safeParse(payload);
  if (!parsed.success) throw new PaymentConfirmationError("Invalid event", 400);
  const event = parsed.data;
  const mode = await deps.accountMode();
  if (mode === "live" && !SHINOBIPAY_LIVE_PROCESSING) throw new PaymentConfirmationError("Live processing unavailable", 503);
  const deposit = await deps.findDeposit(event.data.reference);
  if (!deposit || deposit.mode !== mode || (deposit.intent_id !== null && deposit.intent_id !== event.data.intent_id)) throw new PaymentConfirmationError("Payment mismatch", 400);
  const intent = shinobiIntentSchema.parse(await deps.retrieveIntent(event.data.intent_id));
  // Webhook crediting requires an explicit reference, not a missing optional field.
  if (intent.reference !== deposit.reference) throw new PaymentConfirmationError("Payment mismatch", 400);
  assertIntentMatches(intent, { id: event.data.intent_id, amountMinor: deposit.amount_minor, reference: deposit.reference });
  if (!eventAmountMatchesIntent(event.data.amount, intent)) throw new PaymentConfirmationError("Payment mismatch", 400);
  if (intent.status !== event.data.status) throw new PaymentConfirmationError("Awaiting consistent payment status", 503);
  const result = await deps.record({ _event: event.id, _intent: intent.id, _reference: deposit.reference, _amount: deposit.amount_minor, _status: event.data.status, _sequence: event.sequence });
  return { received: true, credited: result === "credited", result };
}