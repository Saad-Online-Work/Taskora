/* VYQORLUNE — Payment page (TEST MODE only).
 * Requires app.js (TK), js/payment-test.js (VYQ_DEMO) and js/vendor/pdf-lib.min.js.
 * No payment gateway is contacted and no money is charged. */
(function () {
  'use strict';

  const user = TK.getUser();
  if (!user) {
    location.replace('signin.html?next=' + encodeURIComponent('payment.html' + location.search));
    return;
  }

  const PLANS = {
    free: { name: 'Free', price: 0, period: 'forever', badge: 'For personal use' },
    pro:  { name: 'Pro',  price: 9, period: 'month',   badge: 'For growing teams' },
    team: { name: 'Premium', price: 19, period: 'month', badge: 'For larger teams' }
  };
  const TAX_RATE = 0;
  const params = new URLSearchParams(location.search);
  const requested = (params.get('plan') || 'free').toLowerCase();
  const planKey = PLANS[requested] ? requested : 'free';
  const plan = PLANS[planKey];
  const tax = plan.price * TAX_RATE;
  const total = plan.price + tax;
  const tokens = VYQ_DEMO.TOKENS_BY_PLAN[planKey] || 0;

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function money(n) { return '$' + n.toFixed(2); }

  /* ---------- Order summary and token packages ---------- */
  setText('billPlanName', plan.name + ' Plan');
  setText('billPlanPrice', money(plan.price));
  setText('billPlanBadge', plan.badge);
  setText('billPeriod', '/ ' + plan.period);
  setText('billSubtotal', money(plan.price));
  setText('billTax', money(tax));
  setText('billTotal', money(total));
  setText('billTokens', tokens.toLocaleString() + ' tokens');

  const pkgSwitch = document.getElementById('pkgSwitch');
  if (pkgSwitch) {
    pkgSwitch.innerHTML = Object.keys(PLANS).map(k =>
      `<a href="payment.html?plan=${k}" class="pkg ${k === planKey ? 'active' : ''}">${PLANS[k].name} · ${VYQ_DEMO.TOKENS_BY_PLAN[k].toLocaleString()} tokens</a>`
    ).join('');
  }

  /* ---------- Prefill from the signed-in account ---------- */
  const emailInput = document.querySelector('[name="email"]');
  const nameInput = document.querySelector('[name="name"]');
  if (emailInput) { emailInput.value = user.email || ''; emailInput.readOnly = true; }
  if (nameInput) nameInput.value = user.name || '';

  /* ---------- Payment method fields ---------- */
  const methodsWrap = document.getElementById('payMethods');
  const fieldsWrap = document.getElementById('methodFields');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const thisYear = new Date().getFullYear();
  const monthOptions = months.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${String(i + 1).padStart(2, '0')} - ${m}</option>`).join('');
  const yearOptions = Array.from({ length: 12 }, (_, i) => `<option value="${thisYear + i}">${thisYear + i}</option>`).join('');

  const fieldsByMethod = {
    card: `
      <div class="pay-section-title">Card Information</div>
      <div class="form-group">
        <label>Card Number <span class="req">*</span></label>
        <input name="cardNumber" inputmode="numeric" maxlength="19" placeholder="1234 5678 9012 3456" autocomplete="cc-number">
        <div class="form-error" data-error="cardNumber">Please enter a valid test card number, e.g. 4242 4242 4242 4242.</div>
      </div>
      <div class="test-card-hint">
        <span>Test mode: use <strong>4242 4242 4242 4242</strong>, any future expiry, any CVV.</span>
        <button type="button" class="test-card-fill" data-fill-test-card>Fill test card</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Expiry <span class="req">*</span></label>
          <div class="card-expiry-row">
            <select name="cardExpMonth"><option value="">Month</option>${monthOptions}</select>
            <select name="cardExpYear"><option value="">Year</option>${yearOptions}</select>
          </div>
          <div class="form-error" data-error="cardExp">Please select expiry month and year.</div>
        </div>
        <div class="form-group">
          <label>CVV <span class="req">*</span></label>
          <input name="cardCvv" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="cc-csc">
          <div class="form-error" data-error="cardCvv">Please enter CVV.</div>
        </div>
      </div>`,
    paypal: `<div class="pay-section-title">PayPal (test)</div><p class="method-note">Simulated in TEST MODE. You will not be redirected anywhere.</p>`,
    apple:  `<div class="pay-section-title">Apple Pay (test)</div><p class="method-note">Simulated in TEST MODE. No device authorization is requested.</p>`,
    google: `<div class="pay-section-title">Google Pay (test)</div><p class="method-note">Simulated in TEST MODE. No Google account is contacted.</p>`
  };

  let activeMethod = 'card';
  function bindCardInput() {
    const cardInput = document.querySelector('[name="cardNumber"]');
    if (!cardInput) return;
    cardInput.addEventListener('input', e => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    });
  }
  function setMethod(method) {
    activeMethod = method;
    methodsWrap.querySelectorAll('.pay-method').forEach(b => b.classList.toggle('active', b.dataset.method === method));
    fieldsWrap.innerHTML = fieldsByMethod[method] || '';
    bindCardInput();
  }
  methodsWrap.addEventListener('click', e => {
    const btn = e.target.closest('.pay-method');
    if (btn) setMethod(btn.dataset.method);
  });
  fieldsWrap.addEventListener('click', e => {
    if (!e.target.closest('[data-fill-test-card]')) return;
    const next = new Date();
    next.setFullYear(next.getFullYear() + 2);
    const num = document.querySelector('[name="cardNumber"]');
    num.value = VYQ_DEMO.TEST_CARD;
    num.dispatchEvent(new Event('input'));
    document.querySelector('[name="cardExpMonth"]').value = String(next.getMonth() + 1).padStart(2, '0');
    document.querySelector('[name="cardExpYear"]').value = String(next.getFullYear());
    document.querySelector('[name="cardCvv"]').value = '123';
  });
  setMethod('card');

  /* ---------- Receipt buttons ---------- */
  let lastTxn = null;
  let lastPdf = null;
  function receiptStatus(msg, isError) {
    const el = document.getElementById('receiptStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
  }
  function invoiceHtml(txn, preview) {
    const rows = VYQ_DEMO.receiptRows(txn).map(([k, v]) =>
      `<tr><th>${TK.escapeHtml(k)}</th><td>${TK.escapeHtml(v)}</td></tr>`).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>VYQORLUNE ${preview ? 'Bill preview' : 'Receipt'} ${TK.escapeHtml(txn.id)}</title>
<style>body{font-family:Arial,sans-serif;max-width:640px;margin:40px auto;padding:24px;color:#0b1220}
h1{color:#2563eb;margin:0 0 4px}.banner{background:#fef3c7;color:#b45309;padding:10px 14px;border-radius:8px;font-weight:700;margin:18px 0}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #e6ebf3;font-size:14px}th{color:#64748b;width:45%}</style>
</head><body><h1>VYQORLUNE</h1><div>${preview ? 'Bill preview (not paid)' : 'Payment receipt'}</div>
<div class="banner">TEST MODE / DEMO: no real payment was processed</div><table>${rows}</table></body></html>`;
  }
  function previewTransaction() {
    const wallet = VYQ_DEMO.getWallet(user.email);
    return {
      id: 'PREVIEW-NOT-PAID', createdAt: new Date().toISOString(), status: 'Not paid (preview)',
      customerName: user.name || '', customerEmail: user.email, planName: plan.name, period: plan.period,
      subtotal: plan.price, tax, total, currency: 'USD', method: activeMethod, cardLast4: null,
      tokensCredited: 0, balanceAfter: wallet.balance
    };
  }
  document.getElementById('previewBtn').addEventListener('click', () => {
    VYQ_DEMO.downloadBlob(new Blob([invoiceHtml(previewTransaction(), true)], { type: 'text/html' }), 'vyqorlune-bill-preview.html');
    TK.toast('Bill preview downloaded (TEST MODE)', 'success');
  });
  document.getElementById('downloadReceiptPdfBtn').addEventListener('click', async () => {
    if (!lastTxn) return;
    try {
      const blob = lastPdf || await VYQ_DEMO.buildReceiptPdf(lastTxn);
      lastPdf = blob;
      VYQ_DEMO.downloadBlob(blob, 'vyqorlune-TEST-receipt-' + lastTxn.id + '.pdf');
      receiptStatus('PDF receipt downloaded.');
    } catch (err) { receiptStatus('Could not create the PDF: ' + err.message, true); }
  });
  document.getElementById('downloadInvoiceBtn').addEventListener('click', () => {
    if (!lastTxn) return;
    VYQ_DEMO.downloadBlob(new Blob([invoiceHtml(lastTxn, false)], { type: 'text/html' }), 'vyqorlune-TEST-invoice-' + lastTxn.id + '.html');
  });

  function showSuccess(txn) {
    lastTxn = txn;
    lastPdf = null;
    document.getElementById('successInvoice').innerHTML = VYQ_DEMO.receiptRows(txn).map(([k, v]) =>
      `<div><span>${TK.escapeHtml(k)}</span><strong>${TK.escapeHtml(v)}</strong></div>`).join('');
    const view = document.getElementById('viewReceiptLink');
    if (view) view.href = 'receipt.html?id=' + encodeURIComponent(txn.id);
    receiptStatus('Generating your PDF receipt…');
    document.getElementById('paySuccess').classList.add('show');
    VYQ_DEMO.buildReceiptPdf(txn)
      .then(blob => { lastPdf = blob; receiptStatus('PDF receipt is ready to download.'); })
      .catch(err => receiptStatus('Could not create the PDF: ' + err.message, true));
  }

  /* ---------- Pay Now (TEST MODE) ---------- */
  const form = document.getElementById('paymentForm');
  const payBtn = document.getElementById('payBtn');
  const payProgress = document.getElementById('payProgress');
  let paying = false;

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (paying) return;
    form.querySelectorAll('.form-error').forEach(el => el.classList.remove('show'));
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    let ok = true;
    if (!name) { form.querySelector('[data-error="name"]').classList.add('show'); ok = false; }
    if (activeMethod === 'card') {
      const digits = String(fd.get('cardNumber') || '').replace(/\D/g, '');
      if (!VYQ_DEMO.luhnValid(digits)) { form.querySelector('[data-error="cardNumber"]').classList.add('show'); ok = false; }
      if (!fd.get('cardExpMonth') || !fd.get('cardExpYear')) { form.querySelector('[data-error="cardExp"]').classList.add('show'); ok = false; }
      if (!/^\d{3,4}$/.test(String(fd.get('cardCvv') || ''))) { form.querySelector('[data-error="cardCvv"]').classList.add('show'); ok = false; }
    }
    if (!ok) return;

    paying = true;
    const checkoutId = VYQ_DEMO.makeCheckoutId();
    payBtn.classList.add('loading');
    payBtn.disabled = true;
    payProgress.classList.add('show');
    payBtn.style.transition = 'transform .4s cubic-bezier(.2,.7,.2,1)';
    payBtn.style.transform = 'translateX(6px)';

    setTimeout(() => {
      payBtn.style.transform = 'translateX(0)';
      const txn = VYQ_DEMO.recordPurchase({
        checkoutId,
        email: user.email,
        name: name || user.name || '',
        planKey,
        planName: plan.name,
        period: plan.period,
        subtotal: plan.price,
        tax,
        total,
        method: activeMethod,
        cardLast4: activeMethod === 'card' ? String(fd.get('cardNumber') || '').replace(/\D/g, '').slice(-4) : null
      });
      payBtn.classList.remove('loading');
      payBtn.disabled = false;
      payProgress.classList.remove('show');
      paying = false;
      showSuccess(txn);
    }, 900);
  });
})();
