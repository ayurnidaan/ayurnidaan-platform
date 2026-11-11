import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";

const doctorFees: Record<string, number> = { "Dr Nikhil Khatana": 600, "Dr Lalit Madawat": 700, "Dr Nirmal Kumavat": 500 };
const safeRedirect = (value: unknown) => typeof value === "string" && /^(ayurnidaan(?:-dev)?:\/\/payment-callback|exp:\/\/[^\s]+|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/|https:\/\/(?:dist-fawn-zeta-72|dist-vikriti)\.vercel\.app\/)/i.test(value) ? value : null;
const restHeaders = (serviceKey: string, prefer?: string) => ({ Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) });

async function authenticatedUser(request: Request, supabaseUrl: string, anonKey: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

async function serviceQuery(url: string, serviceKey: string) {
  const response = await fetch(url, { headers: restHeaders(serviceKey) });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return response.json();
}

async function serviceInsert(url: string, body: unknown, serviceKey: string) {
  const response = await fetch(url, { method: "POST", headers: restHeaders(serviceKey, "return=representation"), body: JSON.stringify(body) });
  if (!response.ok) { console.error("Payment resource insert failed", response.status, (await response.text()).slice(0, 500)); throw new Error("Could not complete the paid order"); }
  return response.json();
}

async function serviceUpdate(url: string, body: unknown, serviceKey: string) {
  const response = await fetch(url, { method: "PATCH", headers: restHeaders(serviceKey, "return=representation"), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Payment update failed (${response.status})`);
  return response.json();
}

async function serviceRpc(supabaseUrl: string, functionName: string, body: unknown, serviceKey: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: restHeaders(serviceKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error("Payment fulfilment RPC failed", response.status, (await response.text()).slice(0, 300));
    throw new Error("Could not complete the paid order");
  }
  return response.json();
}

async function verifyHmac(value: string, signatureHex: string, secret: string) {
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(signatureHex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(value));
}

async function verifyAndFulfil(transaction: Record<string, any>, paymentId: string, returnedOrderId: string, signature: string, keyId: string, keySecret: string, supabaseUrl: string, serviceKey: string) {
  if (transaction.status === "paid" && transaction.resource_id) return transaction.resource_id as string;
  if (!paymentId || returnedOrderId !== transaction.razorpay_order_id || !(await verifyHmac(`${transaction.razorpay_order_id}|${paymentId}`, signature, keySecret))) throw new Error("Payment verification failed");
  const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` } });
  const payment = paymentResponse.ok ? await paymentResponse.json() : null;
  if (!payment || payment.order_id !== transaction.razorpay_order_id || payment.status !== "captured") throw new Error("Payment has not been captured");
  const resourceId = await serviceRpc(supabaseUrl, "fulfil_verified_payment", { p_transaction_id: transaction.id, p_razorpay_payment_id: paymentId }, serviceKey);
  if (typeof resourceId !== "string") throw new Error("Could not complete the paid order");
  return resourceId;
}

function checkoutConfig(transaction: Record<string, any>, keyId: string, functionUrl: string) {
  const payload = transaction.payload as Record<string, any>;
  const options = { key: keyId, amount: transaction.amount_paise, currency: "INR", name: "Ayurnidaan", description: transaction.purpose === "appointment" ? `Consultation with ${payload.doctor_name}` : `${payload.items?.length || 1} product order`, order_id: transaction.razorpay_order_id, callback_url: `${functionUrl}?action=callback&token=${transaction.checkout_token}`, redirect: true, theme: { color: "#164D39" }, modal: { ondismiss: "dismiss" } };
  const cancelUrl = `${transaction.redirect_url}${transaction.redirect_url.includes("?") ? "&" : "?"}status=cancelled&payment_ref=${transaction.id}`;
  return { options, cancel_url: cancelUrl };
}

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID"); const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL"); const anonKey = Deno.env.get("SUPABASE_ANON_KEY"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!keyId || !keySecret || !supabaseUrl || !anonKey || !serviceKey) throw new Error("Payment service is not fully configured");
    const functionUrl = `${supabaseUrl}/functions/v1/razorpay-payment`;
    const checkoutOrigin = (Deno.env.get("PAYMENT_CHECKOUT_ORIGIN") || "https://dist-vikriti.vercel.app").replace(/\/$/, "");

    if (request.method === "GET" && url.searchParams.get("action") === "checkout") {
      const token = url.searchParams.get("token") || "";
      return Response.redirect(`${checkoutOrigin}/razorpay-checkout.html?token=${encodeURIComponent(token)}`, 303);
    }

    if (request.method === "POST" && url.searchParams.get("action") === "callback") {
      const token = url.searchParams.get("token") || ""; const form = await request.formData();
      const paymentId = String(form.get("razorpay_payment_id") || ""); const returnedOrderId = String(form.get("razorpay_order_id") || ""); const signature = String(form.get("razorpay_signature") || "");
      const [transaction] = await serviceQuery(`${supabaseUrl}/rest/v1/payment_transactions?select=*&checkout_token=eq.${encodeURIComponent(token)}&limit=1`, serviceKey);
      if (!transaction) return new Response("Payment session not found", { status: 404 });
      let resourceId = "";
      try { resourceId = await verifyAndFulfil(transaction, paymentId, returnedOrderId, signature, keyId, keySecret, supabaseUrl, serviceKey); }
      catch (verificationError) { return new Response(verificationError instanceof Error && verificationError.message === "Payment has not been captured" ? "Payment has not been captured" : "Payment verification failed", { status: verificationError instanceof Error && verificationError.message === "Payment has not been captured" ? 409 : 400 }); }
      const redirect = `${transaction.redirect_url}${transaction.redirect_url.includes("?") ? "&" : "?"}status=success&payment_ref=${transaction.id}`;
      return new Response(null, { status: 303, headers: { Location: redirect, "Cache-Control": "no-store" } });
    }

    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    const body = await request.json();
    if (body.action === "checkout_config") {
      const token = String(body.token || "");
      const [transaction] = await serviceQuery(`${supabaseUrl}/rest/v1/payment_transactions?select=*&checkout_token=eq.${encodeURIComponent(token)}&status=eq.created&limit=1`, serviceKey);
      if (!transaction || Date.now() - new Date(transaction.created_at).getTime() > 15 * 60_000) return json({ error: "This payment link has expired." }, 410);
      return json(checkoutConfig(transaction, keyId, functionUrl));
    }
    const user = await authenticatedUser(request, supabaseUrl, anonKey); if (!user) return json({ error: "Authentication required" }, 401);
    const authorization = request.headers.get("Authorization")!;
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "razorpay-payment", 30, 3600);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The payment service is temporarily unavailable." : "Payment request limit reached. Please try again later.", quota.unavailable ? 503 : 429);
    if (body.action === "verify_native") {
      const [transaction] = await serviceQuery(`${supabaseUrl}/rest/v1/payment_transactions?select=*&id=eq.${encodeURIComponent(String(body.payment_ref || ""))}&user_id=eq.${user.id}&limit=1`, serviceKey);
      if (!transaction) return json({ error: "Payment not found" }, 404);
      try {
        const resourceId = await verifyAndFulfil(transaction, String(body.razorpay_payment_id || ""), String(body.razorpay_order_id || ""), String(body.razorpay_signature || ""), keyId, keySecret, supabaseUrl, serviceKey);
        return json({ payment: { status: "paid", resource_id: resourceId } });
      } catch (verificationError) {
        const message = verificationError instanceof Error ? verificationError.message : "Payment verification failed";
        return json({ error: message }, message === "Payment has not been captured" ? 409 : 400);
      }
    }
    if (body.action === "status") {
      const [transaction] = await serviceQuery(`${supabaseUrl}/rest/v1/payment_transactions?select=id,purpose,amount_paise,status,resource_id&id=eq.${encodeURIComponent(String(body.payment_ref || ""))}&user_id=eq.${user.id}&limit=1`, serviceKey);
      return transaction ? json({ payment: transaction }) : json({ error: "Payment not found" }, 404);
    }
    if (body.action !== "create") return json({ error: "Unsupported action" }, 400);
    const purpose = body.purpose === "appointment" || body.purpose === "shop" ? body.purpose : null; const redirectUrl = safeRedirect(body.redirect_url);
    if (!purpose || !redirectUrl) return json({ error: "Invalid payment request" }, 400);
    let amountRupees = 0; let payload: Record<string, any> = {};
    if (purpose === "appointment") {
      const input = body.appointment || {}; amountRupees = doctorFees[input.doctor_name] || 0;
      const appointmentDate = typeof input.appointment_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.appointment_date) ? input.appointment_date : "";
      const today = new Date().toISOString().slice(0, 10);
      const attachments = Array.isArray(input.attachments) ? input.attachments.slice(0, 10).flatMap((item: Record<string, unknown>) => {
        const storagePath = typeof item?.storage_path === "string" ? item.storage_path : "";
        return storagePath.startsWith(`${user.id}/`) ? [{ name: String(item.name || "").slice(0, 160), size: Number(item.size) || null, storage_path: storagePath, type: item.type === "photo" ? "photo" : "report" }] : [];
      }) : [];
      if (!amountRupees || !appointmentDate || appointmentDate < today || typeof input.appointment_time !== "string" || !["Video Consultation", "Audio Consultation"].includes(input.consultation_type) || attachments.length !== (Array.isArray(input.attachments) ? input.attachments.slice(0, 10).length : 0)) return json({ error: "Invalid appointment details" }, 400);
      payload = { doctor_name: input.doctor_name, doctor_initials: String(input.doctor_initials || "").slice(0, 4), appointment_date: appointmentDate, appointment_time: input.appointment_time.slice(0, 20), consultation_type: input.consultation_type, patient_notes: typeof input.patient_notes === "string" ? input.patient_notes.slice(0, 600) : null, symptom_tags: Array.isArray(input.symptom_tags) ? input.symptom_tags.slice(0, 10).map((tag: unknown) => String(tag).slice(0, 80)) : [], attachments };
    } else {
      const items = Array.isArray(body.items) ? body.items.slice(0, 30) : []; const addressId = String(body.address_id || "");
      if (!items.length || !/^[0-9a-f-]{36}$/i.test(addressId)) return json({ error: "Cart and delivery address are required" }, 400);
      const ids: string[] = [...new Set<string>(items.map((item: Record<string, unknown>) => String(item.product_id || "")).filter(Boolean))];
      const productRows = await serviceQuery(`${supabaseUrl}/rest/v1/shop_products?select=id,price&id=in.(${ids.map(encodeURIComponent).join(",")})&active=eq.true`, serviceKey); const prices = new Map(productRows.map((item: Record<string, any>) => [item.id, Number(item.price)]));
      const verifiedItems = items.map((item: Record<string, unknown>) => ({ product_id: String(item.product_id || ""), quantity: Math.max(1, Math.min(20, Math.floor(Number(item.quantity) || 0))), unit_price: prices.get(String(item.product_id || "")) })).filter((item: Record<string, any>) => Number.isFinite(item.unit_price));
      if (!verifiedItems.length || verifiedItems.length !== items.length) return json({ error: "One or more products are unavailable" }, 409);
      const [address] = await serviceQuery(`${supabaseUrl}/rest/v1/user_addresses?select=id,label,recipient_name,address_line,city,state,postcode&id=eq.${addressId}&user_id=eq.${user.id}&limit=1`, serviceKey); if (!address) return json({ error: "Delivery address not found" }, 404);
      amountRupees = verifiedItems.reduce((sum: number, item: Record<string, any>) => sum + item.unit_price * item.quantity, 0); payload = { items: verifiedItems, address };
    }
    const amountPaise = amountRupees * 100;
    const [transaction] = await serviceInsert(`${supabaseUrl}/rest/v1/payment_transactions`, { user_id: user.id, purpose, amount_paise: amountPaise, redirect_url: redirectUrl, payload }, serviceKey);
    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: `ayur_${transaction.id.replace(/-/g, "").slice(0, 24)}`, notes: { payment_ref: transaction.id, purpose, user_id: user.id } }) });
    if (!orderResponse.ok) { const message = (await orderResponse.text()).slice(0, 300); console.error("Razorpay order creation failed", orderResponse.status, message); await serviceUpdate(`${supabaseUrl}/rest/v1/payment_transactions?id=eq.${transaction.id}`, { status: "failed", error_message: "order_creation_failed", updated_at: new Date().toISOString() }, serviceKey); throw new Error("Razorpay could not create the payment order"); }
    const order = await orderResponse.json(); await serviceUpdate(`${supabaseUrl}/rest/v1/payment_transactions?id=eq.${transaction.id}`, { razorpay_order_id: order.id, updated_at: new Date().toISOString() }, serviceKey);
    const nativeOptions: Record<string, unknown> = { ...checkoutConfig({ ...transaction, razorpay_order_id: order.id }, keyId, functionUrl).options };
    delete nativeOptions.callback_url; delete nativeOptions.redirect;
    return json({ payment_ref: transaction.id, amount: amountRupees, checkout_url: `${checkoutOrigin}/razorpay-checkout.html?token=${encodeURIComponent(transaction.checkout_token)}`, checkout_options: nativeOptions });
  } catch (error) { console.error("Razorpay payment failed", error instanceof Error ? error.message : "Unexpected error"); return publicError(corsHeaders, "The payment service is temporarily unavailable."); }
});
