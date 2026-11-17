import { DEVICES_PER_USER, MAX_USERS, MIN_USERS, priceFor } from "./pricing.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function landingPage(env) {
	const price = `$${priceFor(MIN_USERS)}`;
	// Same formula as the server, for showing the price as the buyer picks a number of users.
	const priceTable = JSON.stringify(Object.fromEntries(Array.from({ length: MAX_USERS - MIN_USERS + 1 }, (_, i) => [MIN_USERS + i, priceFor(MIN_USERS + i)])));
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(env.PRODUCT_NAME)} — Google Drive team folders for Obsidian</title>
<meta name="description" content="GSync Teams adds Shared Drives and folder access management to GSync, the free two-way Google Drive sync plugin for Obsidian.">
<style>
:root{--bg:#f6f3ec;--ink:#1f2a1f;--muted:#5d665a;--card:#fffdf8;--line:#ddd6c6;--accent:#6d28d9;--accent2:#4c1d95;--warn:#8a3b12}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header{padding:56px 0 28px;border-bottom:1px solid var(--line)}
.eyebrow{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent2)}
h1{font:800 clamp(34px,6vw,58px)/1.03 Georgia,"Times New Roman",serif;margin:14px 0 16px;letter-spacing:-.01em;max-width:16ch}
.lede{font-size:20px;color:var(--muted);max-width:60ch;margin:0 0 26px}
.cta{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn{display:inline-block;padding:13px 20px;border-radius:10px;font-weight:700;text-decoration:none;border:2px solid var(--ink);color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.small{font-size:14px;color:var(--muted)}
section{padding:44px 0;border-bottom:1px solid var(--line)}
h2{font:700 30px/1.15 Georgia,serif;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:15px}
.pro-tag{font:700 11px/1 ui-monospace,monospace;background:var(--accent2);color:#fff;border-radius:4px;padding:3px 6px;vertical-align:2px;margin-left:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:15px}
th,td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left}th{background:#ece6d7}
td.c,th.c{text-align:center}
.buy{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:start}
@media(max-width:780px){.buy{grid-template-columns:1fr}}
.price{font:800 54px/1 Georgia,serif}.price span{font:600 16px/1 system-ui;color:var(--muted);margin-left:8px}
ul.ticks{padding:0;list-style:none;margin:14px 0}ul.ticks li{padding:4px 0 4px 26px;position:relative}ul.ticks li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:800}
.result{display:none;background:#eef5ea;border:2px solid var(--accent);border-radius:12px;padding:18px;margin-top:12px}
.result code{display:block;word-break:break-all;background:#fff;border:1px dashed var(--accent);padding:12px;border-radius:8px;font-size:13px;margin:10px 0}
.err{display:none;color:var(--warn);font-weight:600;margin-top:10px}
input[type=email]{width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;font-size:16px}
footer{padding:30px 0 50px;color:var(--muted);font-size:14px}
.note{border-left:4px solid var(--accent2);padding:10px 14px;background:var(--card);border-radius:0 8px 8px 0;font-size:15px}
</style>
</head>
<body>
<header><div class="wrap">
  <div class="eyebrow">Obsidian plugin · add-on for GSync</div>
  <h1>Your team's knowledge base, in the Google Drive you already pay for.</h1>
  <p class="lede">GSync syncs Obsidian with Google Drive on desktop, Android and iPhone for free. GSync Teams adds Shared Drives and lets you decide who can view or edit each synced folder, right from Obsidian. Google Drive enforces those roles, so they hold everywhere.</p>
  <div class="cta">
    <a class="btn primary" href="#buy">Get Teams: from ${price}</a>
    <a class="btn" href="https://community.obsidian.md/plugins/gsync">Install GSync free</a>
    <span class="small">One-time. ${MIN_USERS} users for ${price}. No subscription.</span>
  </div>
</div></header>

<section><div class="wrap">
  <h2>What Teams adds</h2>
  <div class="grid">
    <div class="card"><h3>🏢 Shared Drives <span class="pro-tag">TEAMS</span></h3><p>Sync a vault folder with a folder in your company's Shared Drive, so documentation belongs to the business, not to one person's account.</p></div>
    <div class="card"><h3>👥 Manage access <span class="pro-tag">TEAMS</span></h3><p>See who can open each synced folder. Add people by email as Viewer, Commenter, Editor or Manager, change roles, or remove access.</p></div>
    <div class="card"><h3>🔒 Enforced by Google</h3><p>Viewers get every update but can't change shared files. Their edits stay on their own device, so nobody overwrites the team's notes by accident.</p></div>
    <div class="card"><h3>📁 Folder by folder</h3><p>Keep personal notes in your own Drive and team notes in the Shared Drive, side by side in one vault.</p></div>
  </div>
</div></section>

<section><div class="wrap">
  <h2>Free vs Teams</h2>
  <table>
    <tr><th></th><th class="c">GSync (free)</th><th class="c">Teams</th></tr>
    <tr><td>Two-way sync on desktop, Android and iOS</td><td class="c">✓</td><td class="c">✓</td></tr>
    <tr><td>Several vault folders, each with its own Drive folder</td><td class="c">✓</td><td class="c">✓</td></tr>
    <tr><td>Folders others shared with you (view-only handled safely)</td><td class="c">✓</td><td class="c">✓</td></tr>
    <tr><td>Sync settings, themes and plugins across devices</td><td class="c">✓</td><td class="c">✓</td></tr>
    <tr><td>Folders in Shared Drives</td><td class="c">—</td><td class="c">✓</td></tr>
    <tr><td>Manage who can view or edit, inside Obsidian</td><td class="c">—</td><td class="c">✓</td></tr>
  </table>
</div></section>

<section><div class="wrap">
  <h2>Pricing</h2>
  <p>One payment, no subscription. Each user can use GSync Teams on ${DEVICES_PER_USER} devices, for example a computer and a phone. The more users, the lower the price per user.</p>
  <table>
    <tr><th>Users</th><th class="c">Devices</th><th class="c">Price</th><th class="c">Per user</th></tr>
    ${[3, 5, 10, 15, 20, 30].map((n) => `<tr><td>${n}</td><td class="c">${n * DEVICES_PER_USER}</td><td class="c">$${priceFor(n)}</td><td class="c">$${(priceFor(n) / n).toFixed(2)}</td></tr>`).join("\n    ")}
  </table>
  <p class="small">Any number from ${MIN_USERS} to ${MAX_USERS}. More than ${MAX_USERS} users? <a href="mailto:${esc(env.SUPPORT_EMAIL)}">Email us</a>.</p>
</div></section>

<section id="buy"><div class="wrap buy">
  <div>
    <h2>Get GSync Teams</h2>
    <label for="users" style="font-weight:700">Number of users</label>
    <div style="display:flex;gap:10px;align-items:center;margin:6px 0 10px"><input id="users" type="number" min="${MIN_USERS}" max="${MAX_USERS}" value="${MIN_USERS}" style="width:110px;padding:10px;font-size:18px;border:1px solid var(--line);border-radius:8px"> <span class="small" id="devices">${MIN_USERS * DEVICES_PER_USER} devices</span></div>
    <div class="price"><span id="price" style="font:inherit;color:inherit;margin:0">${price}</span><span>once</span></div>
    <ul class="ticks">
      <li>Key appears instantly after checkout${env.RESEND_API_KEY ? " — and is emailed to you" : ""}</li>
      <li>${DEVICES_PER_USER} devices per user; move a slot to a new device any time</li>
      <li>Activate once online, then it works offline</li>
      <li>Every future Teams feature included</li>
    </ul>
    <p class="note">You need the free plugin installed first: <a href="${esc(env.DIRECTORY_URL)}">install it here</a>, then install <a href="${esc(env.DIRECTORY_URL)}">GSync Teams</a> and paste your key in <em>Settings → GSync Teams</em>. Shared Drives require a Google Workspace plan.</p>
  </div>
  <div class="card">
    <button class="btn primary" id="buyBtn" type="button" style="width:100%;font-size:19px;padding:16px">Buy Teams</button>
    <div id="err" class="err"></div>
    <p class="small" style="margin-top:12px">🔒 Secure checkout by Stripe — card, Apple Pay, Google Pay or Link. Your key appears on the next page${env.RESEND_API_KEY ? " and is emailed to you" : ""}. Sold by ${esc(env.SELLER_NAME)}.</p>
  </div>
</div></section>

<section><div class="wrap">
  <h2>Lost your key?</h2>
  <form id="resend" style="max-width:460px">
    <p class="small">Enter the email address you used at checkout and we'll email the key again.</p>
    <input type="email" name="email" required placeholder="you@example.com">
    <p><button class="btn" type="submit">Email my key</button> <span class="small" id="resendMsg"></span></p>
  </form>
</div></section>

<footer><div class="wrap">
  GSync is free and open source. Teams unlocks features in the same plugin. Google Drive and Google Workspace are trademarks of Google LLC; GSync is not affiliated with Google.<br>
  Questions: <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a> · © ${new Date().getFullYear()} ${esc(env.SELLER_NAME)}
</div></footer>

<script>
(function(){
  var btn = document.getElementById('buyBtn'), err = document.getElementById('err');
  var prices = ${priceTable}, usersEl = document.getElementById('users');
  function showPrice(){
    var n = Number(usersEl.value), p = prices[n];
    document.getElementById('price').textContent = p ? '$' + p : '—';
    document.getElementById('devices').textContent = p ? (n * ${DEVICES_PER_USER}) + ' devices' : '${MIN_USERS} to ${MAX_USERS} users';
    btn.disabled = !p;
  }
  usersEl.oninput = showPrice; showPrice();
  btn.onclick = function(){
    btn.disabled = true; btn.textContent = 'Opening secure checkout…'; err.style.display = 'none';
    fetch('/api/checkout', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ users: Number(usersEl.value) }) }).then(function(r){ return r.json(); }).then(function(d){
      if (d.url) { window.location.href = d.url; return; }
      throw new Error(d.error || 'Could not start checkout');
    }).catch(function(e){ err.textContent = e.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Buy Teams'; });
  };
  document.getElementById('resend').onsubmit = function(e){
    e.preventDefault();
    fetch('/api/resend', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ email: e.target.email.value }) })
      .then(function(r){ return r.json(); }).then(function(d){ document.getElementById('resendMsg').textContent = d.message; });
  };
})();
</script>
</body>
</html>`;
}


const STYLE = `<style>
:root{--bg:#f6f3ec;--ink:#1f2a1f;--muted:#5d665a;--card:#fffdf8;--line:#ddd6c6;--accent:#6d28d9;--accent2:#4c1d95;--warn:#8a3b12}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header{padding:56px 0 28px;border-bottom:1px solid var(--line)}
.eyebrow{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent2)}
h1{font:800 clamp(34px,6vw,58px)/1.03 Georgia,"Times New Roman",serif;margin:14px 0 16px;letter-spacing:-.01em;max-width:16ch}
.lede{font-size:20px;color:var(--muted);max-width:60ch;margin:0 0 26px}
.cta{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn{display:inline-block;padding:13px 20px;border-radius:10px;font-weight:700;text-decoration:none;border:2px solid var(--ink);color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.small{font-size:14px;color:var(--muted)}
section{padding:44px 0;border-bottom:1px solid var(--line)}
h2{font:700 30px/1.15 Georgia,serif;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:15px}
.pro-tag{font:700 11px/1 ui-monospace,monospace;background:var(--accent2);color:#fff;border-radius:4px;padding:3px 6px;vertical-align:2px;margin-left:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:15px}
th,td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left}th{background:#ece6d7}
td.c,th.c{text-align:center}
.buy{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:start}
@media(max-width:780px){.buy{grid-template-columns:1fr}}
.price{font:800 54px/1 Georgia,serif}.price span{font:600 16px/1 system-ui;color:var(--muted);margin-left:8px}
ul.ticks{padding:0;list-style:none;margin:14px 0}ul.ticks li{padding:4px 0 4px 26px;position:relative}ul.ticks li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:800}
.result{display:none;background:#eef5ea;border:2px solid var(--accent);border-radius:12px;padding:18px;margin-top:12px}
.result code{display:block;word-break:break-all;background:#fff;border:1px dashed var(--accent);padding:12px;border-radius:8px;font-size:13px;margin:10px 0}
.err{display:none;color:var(--warn);font-weight:600;margin-top:10px}
input[type=email]{width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;font-size:16px}
footer{padding:30px 0 50px;color:var(--muted);font-size:14px}
.note{border-left:4px solid var(--accent2);padding:10px 14px;background:var(--card);border-radius:0 8px 8px 0;font-size:15px}
</style>`;

export function successPage(env, { rec, pending, error }) {
	let body;
	if (rec) {
		body = `<h1 style="font-size:40px">✅ GSync Teams is yours.</h1>
  <p class="lede">Thank you${rec.name ? ", " + esc(rec.name.split(" ")[0]) : ""}! Here's your license key${rec.emailed ? " — a copy was emailed to " + esc(rec.email) : ""}.</p>
  <div class="result" style="display:block"><code id="key">${esc(rec.key)}</code>
  <button class="btn primary" id="copy" type="button">Copy key</button>
  <p>This key is for <b>${esc(rec.users ?? 3)} users</b>, on up to <b>${esc(rec.devices ?? 6)} devices</b>.</p>
  <ol class="small"><li>On each device, install <b>GSync</b> and <b>GSync Teams</b> from Obsidian's Community plugins.</li><li>Open <b>Settings → GSync Teams</b> and paste the key under <b>License key</b>.</li><li>Tap <b>Activate</b> (needs internet once; after that it works offline).</li></ol>
  <p class="small">Save this key somewhere safe. Share it only with people in your business.${rec.emailed ? "" : " We couldn't email it, so please copy it now."}</p></div>
  <p class="small">Don't have the plugin yet? <a href="${esc(env.DIRECTORY_URL)}">Install it here</a>. Order ${esc(rec.orderId)}.</p>`;
	} else if (pending) {
		body = `<h1 style="font-size:40px">⏳ Payment processing</h1><p class="lede">Your payment method takes a little longer to clear. Your key will be emailed automatically as soon as it does — no need to do anything.</p>`;
	} else {
		body = `<h1 style="font-size:40px">Hmm, something's off</h1><p class="lede">${esc(error)}</p><p><a class="btn" href="/#buy">Back to the store</a></p>`;
	}
	return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(env.PRODUCT_NAME)}</title>${STYLE}</head><body><header><div class="wrap">
  <div class="eyebrow">${esc(env.PRODUCT_NAME)}</div>
  ${body}
  <p class="small" style="margin-top:28px">Questions: <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a></p>
</div></header>
<script>var c=document.getElementById('copy');if(c)c.onclick=function(){navigator.clipboard.writeText(document.getElementById('key').textContent).then(function(){c.textContent='Copied ✓'})};</script>
</body></html>`;
}
