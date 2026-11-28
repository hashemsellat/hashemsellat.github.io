"use strict";
(() => {
  const API = "https://hashem-casework-delivery.reassuringnoodle4.chatgpt.site";
  const PRICE = "pri_01m8c7zm88xta533asq4tjajhb";
  const PUBLIC_TOKEN = "live_5f99e78938ab4dc9d446f4a59e9";
  const KEY = "casework-purchases-v1";
  const TXN = /^txn_[a-z\d]{26}$/;
  const TOKEN = /^[a-f0-9]{64}$/;
  const buy = document.getElementById("buy");
  const status = document.getElementById("status");
  const retry = document.getElementById("retry");
  let records = [];
  let current = null;
  let activeToken = null;
  let checking = false;
  let ready = false;
  let storageAvailable = true;

  try {
    records = JSON.parse(localStorage.getItem(KEY) || "[]").filter(validRecord);
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch { storageAvailable = false; }
  function validRecord(item) { return item && TXN.test(item.transactionId) && TOKEN.test(item.deliveryToken); }
  function remember(record) {
    if (!validRecord(record)) return;
    current = record;
    records = [record, ...records.filter(item => item.transactionId !== record.transactionId)].slice(0, 10);
    try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* Access link is also shown after verification. */ }
  }
  function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join(""); }
  const fragment = new URLSearchParams(location.hash.slice(1));
  const saved = { transactionId: fragment.get("order"), deliveryToken: fragment.get("access") };
  if (validRecord(saved)) remember(saved);
  else current = records[0] || null;

  async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    return { response, data };
  }
  function showAccess(data) {
    const url = new URL(data.remixUrl);
    if (url.protocol !== "https:" || !["framer.com", "www.framer.com"].includes(url.hostname) || !url.pathname.startsWith("/remix/")) throw new Error("Invalid access response");
    document.getElementById("remix").href = url.href;
    document.getElementById("access").hidden = false;
    document.getElementById("order-reference").textContent = "Order: " + current.transactionId;
    const accessUrl = new URL(location.origin + location.pathname);
    accessUrl.hash = new URLSearchParams({ order: current.transactionId, access: current.deliveryToken }).toString();
    document.getElementById("access-url").value = accessUrl.href;
    history.replaceState(null, "", accessUrl.href);
    buy.hidden = true;
    retry.hidden = true;
    status.textContent = "Payment confirmed. Thank you for choosing Casework.";
  }
  async function verify(attempt = 0) {
    if (!current || checking) return;
    checking = true;
    buy.hidden = true;
    retry.hidden = true;
    status.textContent = "Confirming your payment and preparing your template…";
    try {
      const { response, data } = await request("/api/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: current.transactionId, deliveryToken: current.deliveryToken }) });
      if (response.ok && data.status === "ready") showAccess(data);
      else if (response.status === 202 && attempt < 12) {
        status.textContent = "Paddle is finishing your payment. This page will check again shortly.";
        setTimeout(() => verify(attempt + 1), 2500);
      } else {
        status.textContent = response.status === 202 ? "Payment is still processing. Check again in a moment; you do not need to pay twice." : (data.error || "We could not confirm this purchase yet. If you paid, contact support with your Paddle receipt.");
        retry.hidden = false;
        if (response.status === 404) buy.hidden = false;
      }
    } catch {
      status.textContent = "We could not reach purchase verification. If you paid, keep this page open and retry. Your Paddle receipt can also help support recover access.";
      retry.hidden = false;
    } finally { checking = false; }
  }
  function onCheckout(event) {
    if (TXN.test(event.data?.transaction_id || "")) {
      const token = event.data.custom_data?.delivery_token || activeToken;
      if (TOKEN.test(token || "")) remember({ transactionId: event.data.transaction_id, deliveryToken: token });
    }
    if (event.name === "checkout.completed") {
      try { Paddle.Checkout.close(); } catch { /* Access verification works even if checkout is already closed. */ }
      if (current) verify();
      else status.textContent = "Payment received. Contact support with your Paddle receipt for template access.";
    } else if (event.name === "checkout.closed" && !checking) {
      status.textContent = "Checkout closed. If you completed payment, check your purchase access below.";
      retry.hidden = !current;
    } else if (event.name === "checkout.error") {
      status.textContent = "Checkout could not open. Please try again or contact support.";
    }
  }
  function openCheckout() {
    if (!ready) return;
    activeToken = randomToken();
    status.textContent = "Complete your payment in Paddle. Your template will appear here afterward.";
    try {
      Paddle.Checkout.open({ items: [{ priceId: PRICE, quantity: 1 }], customData: { delivery_token: activeToken }, settings: { displayMode: "overlay", theme: "light", locale: "en" } });
    } catch { status.textContent = "Checkout could not open. Please refresh this page or contact support."; }
  }
  buy.addEventListener("click", openCheckout);
  retry.addEventListener("click", () => verify());
  document.getElementById("access-url").addEventListener("click", event => event.target.select());
  async function initialize() {
    try {
      const { response, data } = await request("/health");
      if (!response.ok || !data.ready) throw new Error("Not ready");
      if (!window.Paddle) throw new Error("Payment service unavailable");
      Paddle.Initialize({ token: PUBLIC_TOKEN, eventCallback: onCheckout });
      ready = true;
      buy.disabled = !storageAvailable;
      buy.textContent = storageAvailable ? "Buy Casework — $29 USD" : "Allow browser storage to continue";
      status.textContent = storageAvailable ? "Secure payment with Paddle. Template access follows payment confirmation." : "Enable storage for this website so you can recover your purchase after payment.";
      if (current) verify();
      else if (storageAvailable) openCheckout();
    } catch {
      buy.textContent = "Checkout is being prepared";
      status.textContent = "Purchases are temporarily unavailable. Please return shortly or email support.";
      retry.hidden = !current;
    }
  }
  initialize();
})();
