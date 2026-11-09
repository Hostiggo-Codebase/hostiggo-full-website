#!/usr/bin/env node
/**
 * Read-only audit: compares host_payout_methods against what Razorpay Route
 * actually holds for each linked account (account, stakeholder, product config,
 * settlement bank details). Prints a masked report; writes nothing.
 *
 *   node --env-file=.env scripts/audit-route-accounts.mjs
 *   node --env-file=.env scripts/audit-route-accounts.mjs --fix   # also back-fills stakeholder/product ids + status into the DB
 */
import { createClient } from "@supabase/supabase-js";

const FIX = process.argv.includes("--fix");
const auth = "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
const mask = (s) => (s ? String(s).replace(/.(?=.{4})/g, "*") : s);

async function rz(path) {
  const res = await fetch(`https://api.razorpay.com${path}`, { headers: { Authorization: auth } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "hostiggo_testing_schema" },
});

const { data: rows, error } = await db.from("host_payout_methods").select("*").order("id");
if (error) throw error;

for (const r of rows) {
  console.log(`\n#${r.id} ${r.account_holder_name} (${r.host_uuid}) db.status=${r.status}`);
  console.log(`  db: acct=${r.razorpay_account_id} sth=${r.razorpay_stakeholder_id} prd=${r.razorpay_product_id} bank=${mask(r.bank_account_number)} ${r.bank_ifsc} pan=${mask(r.pan_number)}`);
  if (!r.razorpay_account_id) { console.log("  no account id stored -> nothing to fetch"); continue; }

  const acct = await rz(`/v2/accounts/${r.razorpay_account_id}`);
  if (!acct.ok) { console.log(`  ACCOUNT FETCH FAILED ${acct.status}: ${acct.json?.error?.description}`); continue; }
  const a = acct.json;
  console.log(`  rz account: status=${a.status} name=${a.legal_business_name} email=${a.email} phone=${mask(a.phone)}`);

  const sth = await rz(`/v2/accounts/${r.razorpay_account_id}/stakeholders`);
  const sList = sth.json?.items ?? [];
  for (const s of sList) console.log(`  rz stakeholder: ${s.id} name=${s.name} pan=${mask(s.kyc?.pan)}`);
  if (!sList.length) console.log(`  rz stakeholder: NONE (${sth.status} ${sth.json?.error?.description ?? ""})`);

  const prods = await rz(`/v2/accounts/${r.razorpay_account_id}/products`);
  const pList = prods.ok ? (prods.json?.items ?? []) : (r.razorpay_product_id ? [{ id: r.razorpay_product_id }] : []);
  // The list endpoint doesn't always include settlements; fetch each.
  const full = [];
  for (const p of pList) full.push((await rz(`/v2/accounts/${r.razorpay_account_id}/products/${p.id}`)).json);
  for (const p of full) {
    const st = p.active_configuration?.settlements ?? p.requested_configuration?.settlements ?? p.settlements;
    console.log(`  rz product: ${p.id} activation=${p.activation_status} bank=${mask(st?.account_number)} ${st?.ifsc_code ?? ""} beneficiary=${st?.beneficiary_name}`);
    if (p.requirements?.length) console.log(`    requirements: ${p.requirements.map((q) => q.field_reference + ":" + q.reason_code).join(", ")}`);
  }
  if (!full.length) console.log(`  rz product: NONE (${prods.status} ${prods.json?.error?.description ?? ""})`);

  if (FIX) {
    const patch = {};
    if (!r.razorpay_stakeholder_id && sList[0]) patch.razorpay_stakeholder_id = sList[0].id;
    if (!r.razorpay_product_id && full[0]) patch.razorpay_product_id = full[0].id;
    const activated = a.status === "activated" || full.some((p) => p.activation_status === "activated");
    if (activated && r.status !== "active") patch.status = "active";
    if (Object.keys(patch).length) {
      const { error: e } = await db.from("host_payout_methods").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
      console.log(e ? `  FIX FAILED: ${e.message}` : `  FIXED: ${JSON.stringify(patch)}`);
    }
  }
}
