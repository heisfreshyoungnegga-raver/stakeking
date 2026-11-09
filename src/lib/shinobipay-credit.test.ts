// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmShinobiPayment, SHINOBIPAY_LIVE_PROCESSING } from "./shinobipay-confirmation.server";

const userId = "00000000-0000-4000-8000-000000000001";
let db: PGlite;
async function rpc(event = "evt_success", status = "succeeded", sequence = 1, amount = 10000, reference = "deposit", intent = "pi_payment") {
  const result = await db.query<{ result: string }>("select public.confirm_shinobipay_verified_event($1,$2,$3,$4,$5,$6) as result", [event, intent, reference, amount, status, sequence]);
  return result.rows[0]?.result;
}
async function prepareLive() {
  // Isolated fixtures, never sent to ShinobiPay or the hosted database.
  await db.exec("insert into public.shinobipay_deposits(user_id,reference,amount_minor,mode) values ('" + userId + "','verified-test',100,'test')");
  await rpc("evt_test", "succeeded", 1, 100, "verified-test", "pi_test");
  await db.exec("insert into public.shinobipay_credit_gate(id,enabled) values(true,true); update public.shinobipay_deposits set mode='live' where reference='deposit'");
}
async function balance() {
  return (await db.query<{ balance: number }>("select coalesce((select balance_minor from public.shinobipay_cash_wallets where user_id='" + userId + "'),0)::integer as balance")).rows[0]?.balance;
}

describe("Exactly-once isolated ShinobiPay credit", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${userId}'::uuid$$;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create table public.profiles(id uuid primary key,balance numeric not null default 0);
      insert into public.profiles values('${userId}',25);
      select set_config('request.jwt.claim.role','service_role',false);`);
    for (const file of ["0008_shinobipay_verified_payment_records.sql", "0009_shinobipay_attempt_binding_and_verification.sql", "0010_shinobipay_exactly_once_cash_credit.sql"]) {
      await db.exec(readFileSync(new URL(`../../drizzle/migrations/${file}`, import.meta.url), "utf8"));
    }
  }, 30000);
  beforeEach(async () => {
    await db.exec(`truncate public.shinobipay_cash_credits,public.shinobipay_cash_wallets,public.shinobipay_events,public.shinobipay_deposits,public.shinobipay_credit_gate;
      select set_config('request.jwt.claim.role','service_role',false);
      insert into public.shinobipay_deposits(user_id,reference,amount_minor,mode) values('${userId}','deposit',10000,'test');`);
  });
  afterAll(async () => { await db.close(); });

  it("records successful test confirmation without crediting any wallet", async () => {
    expect(await rpc()).toBe("recorded_test_only");
    expect(await balance()).toBe(0);
    expect((await db.query<{ balance: string }>("select balance from public.profiles")).rows[0]?.balance).toBe("25");
    expect((await db.query<{ verified: boolean }>("select webhook_verified_at is not null as verified from public.shinobipay_deposits")).rows[0]?.verified).toBe(true);
  });
  it("credits requested GHS 100 once even when different success event IDs arrive", async () => {
    await prepareLive();
    expect(await rpc()).toBe("credited");
    expect(await rpc()).toBe("duplicate");
    expect(await rpc("evt_second", "succeeded", 2)).toBe("duplicate");
    expect(await balance()).toBe(10000);
    expect((await db.query<{ n: number }>("select count(*)::integer as n from public.shinobipay_cash_credits")).rows[0]?.n).toBe(1);
    expect((await db.query<{ balance: string }>("select balance from public.profiles")).rows[0]?.balance).toBe("25");
  });
  it("GHS 1 verified payment credits exactly GHS 1", async () => {
    await prepareLive();
    await db.exec("update public.shinobipay_deposits set amount_minor=100 where reference='deposit'");
    expect(await rpc("evt_one", "succeeded", 1, 100)).toBe("credited");
    expect(await balance()).toBe(100);
  });
  it("duplicate deliveries submitted together only credit once", async () => {
    await prepareLive();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => rpc()));
    expect(outcomes.filter((value) => value === "credited")).toHaveLength(1);
    expect(await balance()).toBe(10000);
  });
  it("does not credit failed or processing payments", async () => {
    await prepareLive();
    expect(await rpc("evt_pending", "processing", 1)).toBe("recorded");
    expect(await rpc("evt_failed", "failed", 2)).toBe("recorded");
    expect(await rpc("evt_late_success", "succeeded", 3)).toBe("terminal");
    expect(await balance()).toBe(0);
  });
  it("late failure cannot undo a successful credit", async () => {
    await prepareLive();
    await rpc();
    expect(await rpc("evt_late_failure", "failed", 2)).toBe("duplicate");
    expect(await balance()).toBe(10000);
    expect((await db.query<{ status: string }>("select status from public.shinobipay_deposits where reference='deposit'")).rows[0]?.status).toBe("succeeded");
  });
  it("stale success cannot credit after a newer pending event", async () => {
    await prepareLive();
    await rpc("evt_newer", "processing", 4);
    expect(await rpc("evt_stale", "succeeded", 3)).toBe("stale");
    expect(await balance()).toBe(0);
  });
  it("rejects a changed replay payload", async () => {
    await prepareLive();
    await rpc();
    await expect(rpc("evt_success", "failed", 1)).rejects.toThrow("Event mismatch");
    expect(await balance()).toBe(10000);
  });
  it("rejects wrong requested amount, reference, or intent without credit", async () => {
    await prepareLive();
    await expect(rpc("evt_gross", "succeeded", 1, 10200)).rejects.toThrow("Payment mismatch");
    await expect(rpc("evt_wrong", "succeeded", 1, 10000, "other")).rejects.toThrow("Payment mismatch");
    await db.exec("update public.shinobipay_deposits set intent_id='pi_original' where reference='deposit'");
    await expect(rpc()).rejects.toThrow("Payment mismatch");
    expect(await balance()).toBe(0);
  });
  it("live credits require both an explicit gate and verified test success", async () => {
    await db.exec("update public.shinobipay_deposits set mode='live'");
    await expect(rpc()).rejects.toThrow("Live crediting disabled");
    await db.exec("insert into public.shinobipay_credit_gate values(true,true)");
    await expect(rpc()).rejects.toThrow("Live crediting disabled");
    expect(await balance()).toBe(0);
  });
  it("users cannot execute crediting, enable the gate, or write cash balances", async () => {
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    await expect(rpc()).rejects.toThrow("Forbidden");
    const rights = await db.query<{ credit: boolean; gate: boolean; wallet: boolean; ledger: boolean }>(`select
      has_function_privilege('authenticated','public.confirm_shinobipay_verified_event(text,text,text,integer,text,integer)','EXECUTE') as credit,
      has_table_privilege('authenticated','public.shinobipay_credit_gate','UPDATE') as gate,
      has_table_privilege('authenticated','public.shinobipay_cash_wallets','UPDATE') as wallet,
      has_table_privilege('authenticated','public.shinobipay_cash_credits','INSERT') as ledger`);
    expect(rights.rows[0]).toEqual({ credit: false, gate: false, wallet: false, ledger: false });
  });
  it("rolls back event, verification, and ledger if wallet update fails", async () => {
    await prepareLive();
    await db.exec(`create function public.fail_test_wallet() returns trigger language plpgsql as $$begin raise exception 'test failure'; end$$;
      create trigger fail_test before insert on public.shinobipay_cash_wallets for each row execute function public.fail_test_wallet();`);
    try {
      await expect(rpc()).rejects.toThrow("test failure");
      expect((await db.query<{ n: number }>("select count(*)::integer as n from public.shinobipay_cash_credits")).rows[0]?.n).toBe(0);
      expect((await db.query<{ n: number }>("select count(*)::integer as n from public.shinobipay_events where event_id='evt_success'")).rows[0]?.n).toBe(0);
      expect((await db.query<{ webhook_verified_at: string | null }>("select webhook_verified_at from public.shinobipay_deposits where reference='deposit'")).rows[0]?.webhook_verified_at).toBeNull();
    } finally { await db.exec("drop trigger fail_test on public.shinobipay_cash_wallets; drop function public.fail_test_wallet()"); }
    expect(await rpc()).toBe("credited");
  });

  async function signed(raw: string) {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("local-test-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
    return `t=${t},v1=${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
  }
  const event = { id: "evt_signed", type: "payment_intent.succeeded", sequence: 1, data: { intent_id: "pi_payment", reference: "deposit", amount: 10200, currency: "GHS", status: "succeeded" } };
  function dependencies() {
    return {
      secret: "local-test-secret",
      accountMode: vi.fn(async (): Promise<"test" | "live"> => "test"),
      findDeposit: vi.fn(async () => ({ reference: "deposit", amount_minor: 10000, mode: "test", intent_id: null })),
      retrieveIntent: vi.fn(async () => ({ id: "pi_payment", reference: "deposit", amount: 10200, merchant_amount: 10000, currency: "GHS", status: "succeeded" })),
      record: vi.fn(async (args: Parameters<Parameters<typeof confirmShinobiPayment>[2]["record"]>[0]) => {
        const result = await rpc(args._event, args._status, args._sequence, args._amount, args._reference, args._intent);
        if (!result) throw new Error("Missing result");
        return result;
      }),
    };
  }
  it("signed raw notification → authoritative retrieval → real SQL test record → replay no-op", async () => {
    const deps = dependencies();
    const raw = JSON.stringify(event);
    const header = await signed(raw);
    expect(await confirmShinobiPayment(raw, header, deps)).toEqual({ received: true, credited: false, result: "recorded_test_only" });
    expect(deps.retrieveIntent).toHaveBeenCalledWith("pi_payment");
    expect(deps.record.mock.calls[0]?.[0]._amount).toBe(10000);
    expect((await confirmShinobiPayment(raw, header, deps)).result).toBe("duplicate");
    expect(await balance()).toBe(0);
  });
  it("unsigned or tampered messages never reach retrieval or crediting", async () => {
    const deps = dependencies();
    const raw = JSON.stringify(event);
    await expect(confirmShinobiPayment(raw, null, deps)).rejects.toThrow("Invalid signature");
    await expect(confirmShinobiPayment(raw + " ", await signed(raw), deps)).rejects.toThrow("Invalid signature");
    expect(deps.retrieveIntent).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("provider mismatch or outage never records a confirmation", async () => {
    const deps = dependencies();
    const raw = JSON.stringify(event);
    const header = await signed(raw);
    deps.retrieveIntent.mockResolvedValueOnce({ id: "pi_payment", reference: "deposit", amount: 10200, merchant_amount: 10000, currency: "GHS", status: "processing" });
    await expect(confirmShinobiPayment(raw, header, deps)).rejects.toThrow("Awaiting consistent payment status");
    deps.retrieveIntent.mockRejectedValueOnce(new Error("provider offline"));
    await expect(confirmShinobiPayment(raw, header, deps)).rejects.toThrow("provider offline");
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("live callbacks remain disabled even with a valid signature", async () => {
    expect(SHINOBIPAY_LIVE_PROCESSING).toBe(false);
    const deps = dependencies();
    deps.accountMode.mockResolvedValue("live");
    const raw = JSON.stringify(event);
    await expect(confirmShinobiPayment(raw, await signed(raw), deps)).rejects.toThrow("Live processing unavailable");
    expect(deps.record).not.toHaveBeenCalled();
  });
});