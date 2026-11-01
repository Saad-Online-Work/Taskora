/* VYQORLUNE — Shared UI helpers for the sign-in and sign-up pages.
 * Exposes window.VYQ_UI. No backend, no timers used to fake work. */
(function () {
  'use strict';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validEmail(value) { return EMAIL_RE.test(String(value || '').trim()); }

  function showBanner(el, message, type) {
    el.textContent = message;
    el.className = 'auth-banner ' + (type || 'error');
    el.hidden = false;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }
  function hideBanner(el) { el.hidden = true; el.textContent = ''; }

  function setLoading(btn, on) {
    btn.classList.toggle('loading', !!on);
    btn.disabled = !!on;
  }

  /* A field error is a <div class="auth-field"> containing .auth-error text. */
  function setFieldError(fieldEl, message) {
    if (!fieldEl) return;
    const errEl = fieldEl.querySelector('.auth-error');
    if (message) {
      if (errEl) errEl.textContent = message;
      fieldEl.classList.add('has-error');
      const input = fieldEl.querySelector('input');
      if (input) input.setAttribute('aria-invalid', 'true');
    } else {
      fieldEl.classList.remove('has-error');
      const input = fieldEl.querySelector('input');
      if (input) input.removeAttribute('aria-invalid');
    }
  }
  function clearFieldErrors(root) {
    root.querySelectorAll('.auth-field.has-error').forEach(f => setFieldError(f, ''));
  }

  /* Password strength: 0 (empty) to 4 (strong). Length and character variety only. */
  function passwordScore(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
    return Math.max(1, Math.min(4, score));
  }
  function bindStrengthMeter(input, meter) {
    if (!input || !meter) return;
    input.addEventListener('input', () => {
      const s = input.value ? passwordScore(input.value) : 0;
      meter.className = 'auth-meter' + (s ? ' s' + s : '');
    });
  }

  /* Password visibility toggle. Any element with [data-toggle-password] inside an .auth-input-wrap. */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-toggle-password]');
    if (!btn) return;
    const input = btn.closest('.auth-input-wrap').querySelector('input');
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.classList.toggle('visible', reveal);
    btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    btn.setAttribute('aria-pressed', String(reveal));
  });

  /* Page transition: fade the card out, then navigate. Only used for internal links. */
  function leave(url) {
    document.body.classList.add('is-leaving');
    setTimeout(() => { location.href = url; }, 220);
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-leave]');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    leave(a.getAttribute('href'));
  });

  window.VYQ_UI = {
    validEmail, showBanner, hideBanner, setLoading,
    setFieldError, clearFieldErrors, passwordScore, bindStrengthMeter, leave
  };
})();
