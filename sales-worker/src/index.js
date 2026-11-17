/**
 * GSync Teams — Stripe sales + automatic license issuing (Cloudflare Worker).
 *
 * Flow:  "Buy" button → POST /api/checkout → Stripe Checkout (hosted; cards, Apple Pay, Google Pay, Link)
 *        → Stripe redirects to /success?session_id=… → worker re-reads the session from Stripe,
 *        verifies it's paid and is this product → Ed25519-signed key shown on screen + emailed + stored in KV.
 * Backup: Stripe webhook (checkout.session.completed / async_payment_succeeded) issues + emails the key
 *         if the buyer closed the tab or paid with a delayed method. charge.refunded marks the license refunded.
 * Devices: each key allows DEVICES_PER_USER devices per user. The plugin activates a device once
 *          (POST /api/activate) and gets a signed, device-bound activation that works offline.
 */
import nacl from "tweetnacl";
import { landingPage, successPage } from "./page.js";
import { DEVICES_PER_USER, MAX_USERS, MIN_USERS, priceFor } from "./pricing.js";

// ---------- helpers ----------
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...CORS } });
const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const normEmail = (e) => String(e || "").trim().toLowerCase();
const PRODUCT_TAG = "gsync-teams";
const priceCents = (users) => (priceFor(users) ?? 0) * 100;
const DAY = 24 * 60 * 60 * 1000;
/** An activation works offline this long; the plugin refreshes it monthly while online. */
const ACTIVATION_DAYS = 120;

/** Stripe REST call (form-encoded, as Stripe's API expects). */
async function stripe(env, method, path, params) {
	const body = params ? new URLSearchParams(params).toString() : undefined;
	const res = await fetch(`${env.STRIPE_API_BASE || "https://api.stripe.com"}${path}`, {
		method,
		headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
		body,
	});
	const data = await res.json().catch(() => ({}));
	return { ok: res.ok, status: res.status, data };
}

function secretKey(env) {
	const sk = unb64u(String(env.LICENSE_PRIVATE_KEY || "").trim());
	if (sk.length !== 64) throw new Error("LICENSE_PRIVATE_KEY is not a 64-byte tweetnacl secret key");
	return sk;
}

/** `<prefix><b64url payload>.<b64url ed25519 signature over the payload string>` */
function sign(env, prefix, data) {
	const payload = b64u(enc.encode(JSON.stringify(data)));
	return `${prefix}${payload}.${b64u(nacl.sign.detached(enc.encode(payload), secretKey(env)))}`;
}

/** License key: GST-… with name, tier, issue date, id and number of users. */
function signLicense(env, name, users) {
	const id = b64u(crypto.getRandomValues(new Uint8Array(6)));
	return { id, key: sign(env, "GST-", { n: name, t: "teams", i: new Date().toISOString().slice(0, 10), id, s: users }) };
}

/** Read a license key this worker signed. Returns its payload, or null. */
function readLicense(env, key) {
	const m = String(key || "").trim().match(/^GST-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
	if (!m) return null;
	try {
		const pk = nacl.sign.keyPair.fromSecretKey(secretKey(env)).publicKey;
		if (!nacl.sign.detached.verify(enc.encode(m[1]), unb64u(m[2]), pk)) return null;
		const p = JSON.parse(new TextDecoder().decode(unb64u(m[1])));
		if (p.t !== "teams" || typeof p.id !== "string") return null;
		const users = Number.isInteger(p.s) && p.s > 0 ? p.s : MIN_USERS;
		return { id: p.id, name: p.n, users, devices: users * DEVICES_PER_USER };
	} catch { return null; }
}

/** Issue once per Checkout Session (idempotent): verify, sign, store, email. */
async function issueForSession(env, s, source) {
	const existing = await env.LICENSES.get(`order:${s.id}`, "json");
	if (existing) return existing;

	if (s.metadata?.product !== PRODUCT_TAG) throw new Error("This payment isn't for GSync Teams.");
	if (s.status !== "complete") return { incomplete: true };
	if (!["paid", "no_payment_required"].includes(s.payment_status)) {
		return { pending: true, status: s.payment_status };
	}
	const users = Number(s.metadata?.users);
	if (priceFor(users) === null) throw new Error("This payment doesn't say how many users it's for.");
	// Promo codes may lower the amount; it can never be more than the list price or a different currency.
	if (String(s.currency).toUpperCase() !== String(env.CURRENCY).toUpperCase() || s.amount_total > priceCents(users)) {
		console.log("Amount/currency mismatch", s.id, s.amount_total, s.currency);
		throw new Error("Payment details don't match this product.");
	}

	const email = normEmail(s.customer_details?.email || s.customer_email);
	const name = (s.customer_details?.name || "").trim() || email.split("@")[0] || "Customer";
	const lic = signLicense(env, email ? `${name} <${email}>` : name, users);
	const record = {
		key: lic.key,
		licenseId: lic.id,
		users,
		devices: users * DEVICES_PER_USER,
		name, email,
		orderId: s.id,
		paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id || null,
		amount: `${(s.amount_total / 100).toFixed(2)} ${String(s.currency).toUpperCase()}`,
		issued: new Date().toISOString(),
		source,
	};
	await env.LICENSES.put(`order:${s.id}`, JSON.stringify(record));
	await env.LICENSES.put(`lic:${lic.id}`, s.id);
	if (record.paymentIntent) await env.LICENSES.put(`pi:${record.paymentIntent}`, s.id);
	if (email) {
		const list = (await env.LICENSES.get(`email:${email}`, "json")) || [];
		if (!list.includes(s.id)) list.push(s.id);
		await env.LICENSES.put(`email:${email}`, JSON.stringify(list));
	}
	record.emailed = await sendKeyEmail(env, record);
	await env.LICENSES.put(`order:${s.id}`, JSON.stringify(record));
	return record;
}

async function sendKeyEmail(env, rec) {
	if (!env.RESEND_API_KEY || !rec.email) return false;
	const text = `Thanks for buying ${env.PRODUCT_NAME}!

Your license key:

${rec.key}

This key is for ${rec.users} users, on up to ${rec.devices} devices (2 per user).

To activate, on each device:
1. Install GSync and GSync Teams from Obsidian's Community plugins.
2. Open Settings → GSync Teams and paste the key under License key.
3. Tap Activate. (Activation needs an internet connection once; after that GSync Teams works offline.)

Share the key only with people in your business. To move a device's slot to a new device,
use "Remove" next to the old device in Settings → GSync Teams.
Install / update the plugin: ${env.DIRECTORY_URL}
Order: ${rec.orderId} · ${rec.amount}

Questions? Reply to this email or write ${env.SUPPORT_EMAIL}.
— ${env.SELLER_NAME}`;
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
			body: JSON.stringify({ from: env.EMAIL_FROM, to: [rec.email], reply_to: env.SUPPORT_EMAIL, subject: `Your ${env.PRODUCT_NAME} license key`, text }),
		});
		return res.ok;
	} catch { return false; }
}

/** Verify Stripe-Signature header (HMAC-SHA256 of "t.payload", 5-minute tolerance). */
async function verifyStripeSignature(env, header, payload) {
	if (!header || !env.STRIPE_WEBHOOK_SECRET) return false;
	let t = null; const v1 = [];
	for (const kv of header.split(",")) {
		const [k, v] = kv.split("=");
		if (k === "t") t = v; else if (k === "v1") v1.push(v);
	}
	if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
	const key = await crypto.subtle.importKey("raw", enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
	const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
	// constant-time compare
	return v1.some((sig) => sig.length === hex.length && [...sig].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

// ---------- routes ----------
/** Start a Stripe Checkout for `users` users. Returns { url } or { error, status }. */
async function startCheckout(env, origin, users) {
	const n = Number(users);
	if (priceFor(n) === null) return { error: `Choose between ${MIN_USERS} and ${MAX_USERS} users.`, status: 400 };
	const params = {
		mode: "payment",
		"line_items[0][quantity]": "1",
		"line_items[0][price_data][currency]": env.CURRENCY.toLowerCase(),
		"line_items[0][price_data][unit_amount]": String(priceCents(n)), // price is set HERE, never by the browser
		"line_items[0][price_data][product_data][name]": `${env.PRODUCT_NAME}: ${n} users`,
		"line_items[0][price_data][product_data][description]": `One-time license for ${n} users, up to ${n * DEVICES_PER_USER} devices (2 per user): Shared Drives and managing folder access with GSync for Obsidian.`,
		"metadata[product]": PRODUCT_TAG,
		"metadata[users]": String(n),
		"payment_intent_data[metadata][product]": PRODUCT_TAG,
		"payment_intent_data[metadata][users]": String(n),
		success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
		// Back to the page the buyer came from: your own site (SITE_URL) or this worker's page.
		cancel_url: env.SITE_URL || `${origin}/#buy`,
		allow_promotion_codes: "true",
		"custom_text[submit][message]": "Your license key appears on the next page and is emailed to you.",
	};
	if (env.STRIPE_AUTOMATIC_TAX === "true") params["automatic_tax[enabled]"] = "true";
	const r = await stripe(env, "POST", "/v1/checkout/sessions", params);
	if (!r.ok || !r.data.url) { console.log("checkout create failed", r.status, JSON.stringify(r.data)); return { error: "Couldn't start checkout. Please try again.", status: 502 }; }
	return { url: r.data.url };
}

/** POST /api/checkout {users}: used by this worker's own page. */
async function createCheckout(env, origin, request) {
	const { users } = await request.json().catch(() => ({}));
	const r = await startCheckout(env, origin, users);
	return r.url ? json({ url: r.url }) : json({ error: r.error }, r.status);
}

/**
 * GET /buy?users=N: a plain link for buttons on another website (e.g. idcomm.tech).
 * Starts Stripe Checkout and redirects straight to it.
 */
async function buyLink(env, origin, url) {
	const r = await startCheckout(env, origin, url.searchParams.get("users") || MIN_USERS);
	if (r.url) return Response.redirect(r.url, 303);
	const back = env.SITE_URL || `${origin}/#buy`;
	return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GSync Teams</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:0 16px"><h1>Checkout didn't start</h1><p>${r.error}</p><p><a href="${back}">Go back</a></p>`, { status: r.status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function success(env, sessionId) {
	if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || "")) return html(successPage(env, { error: "Missing or invalid checkout session." }), 400);
	const existing = await env.LICENSES.get(`order:${sessionId}`, "json");
	if (existing) return html(successPage(env, { rec: existing }));
	const r = await stripe(env, "GET", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
	if (!r.ok) return html(successPage(env, { error: "We couldn't find that checkout session." }), 404);
	try {
		const rec = await issueForSession(env, r.data, "checkout");
		if (rec.incomplete) return html(successPage(env, { error: "Checkout wasn't completed, so you haven't been charged." }));
		if (rec.pending) return html(successPage(env, { pending: true }));
		return html(successPage(env, { rec }));
	} catch (e) {
		return html(successPage(env, { error: `${e.message} If you were charged, email ${env.SUPPORT_EMAIL} with order ${sessionId}.` }), 400);
	}
}

async function webhook(env, request) {
	const payload = await request.text();
	if (!(await verifyStripeSignature(env, request.headers.get("stripe-signature"), payload))) return json({ error: "bad signature" }, 400);
	const event = JSON.parse(payload);
	const obj = event.data?.object || {};
	try {
		if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
			if (obj.metadata?.product === PRODUCT_TAG) await issueForSession(env, obj, "webhook");
		} else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
			const pi = obj.payment_intent;
			const sid = pi && (await env.LICENSES.get(`pi:${pi}`));
			const rec = sid && (await env.LICENSES.get(`order:${sid}`, "json"));
			if (rec) { rec.refunded = event.type; await env.LICENSES.put(`order:${sid}`, JSON.stringify(rec)); }
		}
	} catch (e) { console.log("webhook handling failed", event.type, e.message); }
	return json({ received: true }); // always 200 once verified, so Stripe doesn't retry forever
}

/** "Lost my key" — only ever emails the key to the purchase address; never reveals it on screen. */
async function resend(env, request) {
	const { email } = await request.json().catch(() => ({}));
	const e = normEmail(email);
	const generic = json({ message: "If that email matches a purchase, the key is on its way. Check spam, or contact support." });
	if (!e || !e.includes("@")) return generic;
	if (await env.LICENSES.get(`ratelimit:${e}`)) return generic;
	await env.LICENSES.put(`ratelimit:${e}`, "1", { expirationTtl: 600 });
	for (const id of (await env.LICENSES.get(`email:${e}`, "json")) || []) {
		const rec = await env.LICENSES.get(`order:${id}`, "json");
		if (rec && !rec.refunded) await sendKeyEmail(env, rec);
	}
	return generic;
}

// ---------- devices ----------
/** Validate the key and load its device list. Refunded or disputed licenses can't activate. */
async function loadLicense(env, body) {
	const lic = readLicense(env, body.key);
	if (!lic) return { error: json({ error: "That license key isn't valid." }, 403) };
	const orderId = await env.LICENSES.get(`lic:${lic.id}`);
	const order = orderId && (await env.LICENSES.get(`order:${orderId}`, "json"));
	if (order?.refunded) return { error: json({ error: "This license was refunded and can't be used." }, 403) };
	// Light rate limit: at most 60 device requests per license per hour.
	const rlKey = `rl:${lic.id}:${new Date().toISOString().slice(0, 13)}`;
	const count = Number((await env.LICENSES.get(rlKey)) || 0);
	if (count >= 60) return { error: json({ error: "Too many requests. Try again in an hour." }, 429) };
	await env.LICENSES.put(rlKey, String(count + 1), { expirationTtl: 3700 });
	const devices = (await env.LICENSES.get(`devices:${lic.id}`, "json")) || [];
	return { lic, devices };
}

const validDevice = (d) => typeof d === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(d);
const cleanName = (n) => String(n || "Device").replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 40) || "Device";
const publicList = (devices) => devices.map(({ id, name, added, seen }) => ({ id, name, added, seen }));

/** Activate (or refresh) this device. Returns a signed activation bound to the device. */
async function activate(env, request) {
	const body = await request.json().catch(() => ({}));
	if (!validDevice(body.device)) return json({ error: "Invalid device id." }, 400);
	const { lic, devices, error } = await loadLicense(env, body);
	if (error) return error;
	const now = new Date().toISOString();
	const known = devices.find((d) => d.id === body.device);
	if (!known && body.refresh) {
		// Background refresh from a device that was removed: don't take a slot back.
		return json({ error: "This device was removed from the license. Activate it again in Settings → GSync Teams." }, 410);
	}
	if (known) {
		known.seen = now;
		known.name = cleanName(body.name || known.name);
	} else {
		if (devices.length >= lic.devices) {
			return json({ error: `All ${lic.devices} devices for this license are in use. Remove one in Settings → GSync Teams, on any activated device.`, limit: lic.devices, devices: publicList(devices) }, 409);
		}
		devices.push({ id: body.device, name: cleanName(body.name), added: now, seen: now });
	}
	await env.LICENSES.put(`devices:${lic.id}`, JSON.stringify(devices));
	const token = sign(env, "GSA-", { l: lic.id, d: body.device, iat: Date.now(), e: Date.now() + ACTIVATION_DAYS * DAY });
	return json({ token, used: devices.length, limit: lic.devices, devices: publicList(devices) });
}

/** List this license's devices. */
async function listDevices(env, request) {
	const body = await request.json().catch(() => ({}));
	const { lic, devices, error } = await loadLicense(env, body);
	if (error) return error;
	return json({ used: devices.length, limit: lic.devices, devices: publicList(devices) });
}

/** Free a device slot (this device, or a lost or replaced one). */
async function deactivate(env, request) {
	const body = await request.json().catch(() => ({}));
	if (!validDevice(body.device)) return json({ error: "Invalid device id." }, 400);
	const { lic, devices, error } = await loadLicense(env, body);
	if (error) return error;
	const left = devices.filter((d) => d.id !== body.device);
	await env.LICENSES.put(`devices:${lic.id}`, JSON.stringify(left));
	return json({ used: left.length, limit: lic.devices, devices: publicList(left) });
}

/** Manual keys for reviewers, giveaways or sales made elsewhere. */
async function adminIssue(env, request) {
	if (!env.ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
	const { name, email, sendEmail, users = MIN_USERS } = await request.json().catch(() => ({}));
	if (!name) return json({ error: "name required" }, 400);
	const n = Number(users);
	if (!Number.isInteger(n) || n < 1 || n > 1000) return json({ error: "users must be a whole number" }, 400);
	const e = normEmail(email);
	const orderId = `manual-${Date.now()}`;
	const lic = signLicense(env, e ? `${name} <${e}>` : name, n);
	const rec = { key: lic.key, licenseId: lic.id, users: n, devices: n * DEVICES_PER_USER, name, email: e, orderId, amount: "comp", issued: new Date().toISOString(), source: "admin" };
	await env.LICENSES.put(`order:${orderId}`, JSON.stringify(rec));
	await env.LICENSES.put(`lic:${lic.id}`, orderId);
	if (e) {
		const list = (await env.LICENSES.get(`email:${e}`, "json")) || [];
		list.push(orderId);
		await env.LICENSES.put(`email:${e}`, JSON.stringify(list));
	}
	if (sendEmail) rec.emailed = await sendKeyEmail(env, rec);
	return json(rec);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const p = url.pathname;
		if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
		try {
			if (request.method === "GET" && (p === "/" || p === "/pro")) return html(landingPage(env));
			if (request.method === "GET" && p === "/success") return success(env, url.searchParams.get("session_id"));
			if (request.method === "GET" && p === "/api/health") return json({ ok: true, live: /^(sk|rk)_live_/.test(String(env.STRIPE_SECRET_KEY || "")) });
			if (request.method === "POST" && p === "/api/checkout") return createCheckout(env, env.PUBLIC_URL || url.origin, request);
			if (request.method === "GET" && p === "/buy") return buyLink(env, env.PUBLIC_URL || url.origin, url);
			if (request.method === "POST" && p === "/api/activate") return activate(env, request);
			if (request.method === "POST" && p === "/api/devices") return listDevices(env, request);
			if (request.method === "POST" && p === "/api/deactivate") return deactivate(env, request);
			if (request.method === "POST" && p === "/api/stripe/webhook") return webhook(env, request);
			if (request.method === "POST" && p === "/api/resend") return resend(env, request);
			if (request.method === "POST" && p === "/api/admin/issue") return adminIssue(env, request);
			return json({ error: "not found" }, 404);
		} catch (e) {
			console.log("error", e && e.stack);
			return json({ error: "Something went wrong. You have not been charged unless Stripe sent you a receipt." }, 500);
		}
	},
};