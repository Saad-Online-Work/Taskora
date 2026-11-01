/* VYQORLUNE — TEST MODE payment module (academic demo).
 *
 * No real money moves. No payment gateway is contacted. Card numbers are checked
 * for format only (Luhn), are never sent anywhere and are never stored: only the
 * last four digits appear on the receipt.
 *
 * Exposes window.VYQ_DEMO:
 *   TOKENS_BY_PLAN, luhnValid, recordPurchase, getWallet, buildReceiptPdf,
 *   buildReceiptPng, downloadBlob, TEST_CARD
 */
(function () {
  'use strict';

  const TOKENS_BY_PLAN = { free: 0, pro: 1000, team: 5000 };
  const TEST_CARD = '4242 4242 4242 4242';
  const STORE_PREFIX = 'vyqorlune.wallet.v1.';

  /* Luhn checksum: rejects mistyped numbers the way a real checkout would. */
  function luhnValid(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0, alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function loadWallet(email) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + email);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to empty wallet */ }
    return { balance: 0, transactions: [] };
  }

  function saveWallet(email, wallet) {
    localStorage.setItem(STORE_PREFIX + email, JSON.stringify(wallet));
  }

  function getWallet(email) {
    return loadWallet(email);
  }

  function makeTransactionId() {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return 'TEST-' + Date.now().toString(36).toUpperCase() + '-' + rand;
  }

  /**
   * Record a completed TEST purchase and credit tokens to the user's wallet.
   * Returns the transaction object so the success screen and receipts use the same data.
   */
  function recordPurchase(opts) {
    const wallet = loadWallet(opts.email);
    /* Idempotent: the same checkoutId can never credit tokens twice (refresh, double click). */
    if (opts.checkoutId) {
      const existing = wallet.transactions.find(t => t.checkoutId === opts.checkoutId);
      if (existing) return existing;
    }
    const tokens = TOKENS_BY_PLAN[opts.planKey] || 0;
    const txn = {
      id: makeTransactionId(),
      checkoutId: opts.checkoutId || null,
      mode: 'TEST',
      status: 'Succeeded (test)',
      createdAt: new Date().toISOString(),
      customerName: opts.name,
      customerEmail: opts.email,
      planKey: opts.planKey,
      planName: opts.planName,
      period: opts.period,
      subtotal: opts.subtotal,
      tax: opts.tax,
      total: opts.total,
      currency: 'USD',
      method: opts.method,
      cardLast4: opts.cardLast4 || null,
      tokensCredited: tokens,
      balanceAfter: wallet.balance + tokens
    };
    wallet.balance = txn.balanceAfter;
    wallet.transactions.unshift(txn);
    saveWallet(opts.email, wallet);
    return txn;
  }

  function makeCheckoutId() {
    return 'chk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function money(n) { return '$' + Number(n || 0).toFixed(2); }

  function formatDate(iso) {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function methodLabel(txn) {
    const names = { card: 'Card', paypal: 'PayPal', apple: 'Apple Pay', google: 'Google Pay' };
    const base = names[txn.method] || txn.method;
    return txn.method === 'card' && txn.cardLast4 ? base + ' ending ' + txn.cardLast4 : base;
  }

  /** Rows shared by the on-screen details, the PDF and the PNG, so they always match. */
  function receiptRows(txn) {
    return [
      ['Transaction ID', txn.id],
      ['Date', formatDate(txn.createdAt)],
      ['Status', txn.status],
      ['Mode', 'TEST MODE (demo, no real charge)'],
      ['Customer', txn.customerName + ' <' + txn.customerEmail + '>'],
      ['Plan', txn.planName + ' (' + (txn.period === 'forever' ? 'free' : 'per ' + txn.period) + ')'],
      ['Payment method', methodLabel(txn)],
      ['Subtotal', money(txn.subtotal)],
      ['Tax', money(txn.tax)],
      ['Total', money(txn.total) + ' ' + txn.currency],
      ['Tokens credited', txn.tokensCredited.toLocaleString() + ' tokens'],
      ['Token balance after', txn.balanceAfter.toLocaleString() + ' tokens']
    ];
  }

  /** Build a PDF receipt with pdf-lib (vendored at js/vendor/pdf-lib.min.js). */
  async function buildReceiptPdf(txn) {
    if (!window.PDFLib) throw new Error('PDF library failed to load.');
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const blue = rgb(0.149, 0.388, 0.922);
    const ink = rgb(0.04, 0.07, 0.13);
    const muted = rgb(0.39, 0.45, 0.55);
    const amber = rgb(0.85, 0.47, 0.02);

    // Header band
    page.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: blue });
    page.drawText('VYQORLUNE', { x: 48, y: 800, size: 22, font: bold, color: rgb(1, 1, 1) });
    page.drawText('Payment receipt', { x: 48, y: 778, size: 12, font: regular, color: rgb(0.85, 0.92, 1) });

    // TEST MODE banner
    page.drawRectangle({ x: 48, y: 720, width: 499, height: 28, color: rgb(1, 0.96, 0.85), borderColor: amber, borderWidth: 1 });
    page.drawText('TEST MODE / DEMO: no real payment was processed', { x: 60, y: 729, size: 11, font: bold, color: amber });

    // Details
    let y = 680;
    for (const [label, value] of receiptRows(txn)) {
      page.drawText(label, { x: 48, y, size: 11, font: bold, color: muted });
      page.drawText(String(value), { x: 210, y, size: 11, font: regular, color: ink });
      page.drawLine({ start: { x: 48, y: y - 8 }, end: { x: 547, y: y - 8 }, thickness: 0.5, color: rgb(0.89, 0.92, 0.96) });
      y -= 30;
    }

    // Footer
    page.drawText('This is a demonstration receipt generated in TEST MODE for an academic project.', {
      x: 48, y: 120, size: 9.5, font: regular, color: muted
    });
    page.drawText('No card was charged. Card details were never transmitted or stored.', {
      x: 48, y: 106, size: 9.5, font: regular, color: muted
    });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /** Draw the same receipt onto a canvas and return a PNG blob (no external library). */
  function buildReceiptPng(txn) {
    return new Promise((resolve, reject) => {
      const W = 900, rows = receiptRows(txn), rowH = 40;
      const H = 260 + rows.length * rowH + 80;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas is not available in this browser.'));

      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, 110);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 32px Inter, Arial, sans-serif'; ctx.fillText('VYQORLUNE', 48, 56);
      ctx.font = '400 18px Inter, Arial, sans-serif'; ctx.fillStyle = '#dbeafe'; ctx.fillText('Payment receipt', 48, 86);

      ctx.fillStyle = '#fef3c7'; ctx.fillRect(48, 134, W - 96, 40);
      ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1; ctx.strokeRect(48.5, 134.5, W - 97, 39);
      ctx.fillStyle = '#b45309'; ctx.font = '700 17px Inter, Arial, sans-serif';
      ctx.fillText('TEST MODE / DEMO: no real payment was processed', 64, 160);

      let y = 220;
      rows.forEach(([label, value]) => {
        ctx.fillStyle = '#64748b'; ctx.font = '700 16px Inter, Arial, sans-serif'; ctx.fillText(label, 48, y);
        ctx.fillStyle = '#0b1220'; ctx.font = '400 16px Inter, Arial, sans-serif'; ctx.fillText(String(value), 280, y);
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(48, y + 12, W - 96, 1);
        y += rowH;
      });

      ctx.fillStyle = '#64748b'; ctx.font = '400 14px Inter, Arial, sans-serif';
      ctx.fillText('Demonstration receipt generated in TEST MODE. No card was charged.', 48, H - 40);

      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png');
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.VYQ_DEMO = {
    TOKENS_BY_PLAN, TEST_CARD, luhnValid, recordPurchase, getWallet, makeCheckoutId,
    buildReceiptPdf, buildReceiptPng, downloadBlob, receiptRows, money
  };
})();
