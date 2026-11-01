/* VYQORLUNE — Frontend-only account system (localStorage + Web Crypto).
 * No server, no third-party service. Passwords are never stored in plain text:
 * PBKDF2-SHA256 with a random 16-byte salt and 150,000 iterations.
 * Session = the active user record in localStorage ('taskora.user.v1') with loggedOut:false.
 * Exposes window.VYQ_AUTH, the API the sign-up and sign-in pages use. */
(function () {
  'use strict';

  const ACCOUNTS_KEY = 'vyqorlune.accounts.v1';
  const USER_KEY = 'taskora.user.v1';
  const ITERATIONS = 150000;

  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function norm(email) { return String(email || '').trim().toLowerCase(); }
  function toHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function accounts() { return read(ACCOUNTS_KEY, {}); }

  function subtle() {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('This browser cannot secure passwords on this address. Open the site from localhost or https.');
    }
    return crypto.subtle;
  }
  async function hashPassword(password, saltHex) {
    const s = subtle();
    const key = await s.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS }, key, 256);
    return toHex(bits);
  }
  function newSalt() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return toHex(b.buffer);
  }

  /* Before the active session changes, copy its onboarding progress back to its account. */
  function syncCurrent() {
    const u = read(USER_KEY, null);
    if (!u || !u.email) return;
    const all = accounts();
    const acc = all[norm(u.email)];
    if (!acc) return;
    acc.onboarded = !!u.onboarded;
    if (u.onboardedAt) acc.onboardedAt = u.onboardedAt;
    write(ACCOUNTS_KEY, all);
  }

  function publicUser(u) {
    return { id: norm(u.email), name: u.name || '', email: norm(u.email), onboarded: !!u.onboarded };
  }

  function friendlyError(err) {
    return (err && err.message) || 'Something went wrong. Please try again.';
  }

  async function signUp({ name, email, password }) {
    syncCurrent();
    const e = norm(email);
    const all = accounts();
    const legacy = read(USER_KEY, null);
    const claimable = legacy && norm(legacy.email) === e && !legacy.passwordHash;
    if (all[e] || (legacy && norm(legacy.email) === e && !claimable)) {
      throw new Error('An account with this email already exists. Try signing in instead.');
    }
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    const acc = { name: String(name).trim(), email: e, salt, hash, onboarded: false, createdAt: new Date().toISOString() };
    all[e] = acc;
    write(ACCOUNTS_KEY, all);
    const user = { name: acc.name, email: e, onboarded: false, createdAt: acc.createdAt, loggedOut: false };
    write(USER_KEY, user);
    return { user: publicUser(user), session: publicUser(user) };
  }

  async function signIn({ email, password }) {
    syncCurrent();
    const e = norm(email);
    const all = accounts();
    let acc = all[e];
    const legacy = read(USER_KEY, null);
    if (!acc) {
      /* Accounts created by the first prototype stored btoa(password). Accept that once and upgrade it. */
      if (legacy && norm(legacy.email) === e && legacy.passwordHash && legacy.passwordHash === btoa(password)) {
        const salt = newSalt();
        acc = { name: legacy.name || '', email: e, salt, hash: await hashPassword(password, salt),
                onboarded: !!legacy.onboarded, createdAt: legacy.createdAt || new Date().toISOString() };
        all[e] = acc;
        write(ACCOUNTS_KEY, all);
      } else {
        throw new Error('Incorrect email or password.');
      }
    } else if (await hashPassword(password, acc.salt) !== acc.hash) {
      throw new Error('Incorrect email or password.');
    }
    const sameAsSession = legacy && norm(legacy.email) === e;
    const user = {
      name: acc.name, email: e,
      onboarded: sameAsSession ? !!legacy.onboarded : !!acc.onboarded,
      onboardedAt: acc.onboardedAt, createdAt: acc.createdAt, loggedOut: false
    };
    write(USER_KEY, user);
    return { user: publicUser(user), session: publicUser(user) };
  }

  async function signOut() {
    syncCurrent();
    const u = read(USER_KEY, null);
    if (u) { u.loggedOut = true; write(USER_KEY, u); }
  }

  /* DEMO ONLY: no email is sent. Sets a new password for an existing account on this browser. */
  async function resetPassword({ email, password }) {
    const e = norm(email);
    const all = accounts();
    let acc = all[e];
    const legacy = read(USER_KEY, null);
    if (!acc) {
      if (legacy && norm(legacy.email) === e) {
        acc = { name: legacy.name || '', email: e, onboarded: !!legacy.onboarded, createdAt: legacy.createdAt || new Date().toISOString() };
      } else {
        throw new Error('No account was found for this email on this browser.');
      }
    }
    const salt = newSalt();
    acc.salt = salt;
    acc.hash = await hashPassword(password, salt);
    acc.passwordResetAt = new Date().toISOString();
    all[e] = acc;
    write(ACCOUNTS_KEY, all);
    return { ok: true };
  }

  async function getSession() {
    const u = read(USER_KEY, null);
    return (u && u.email && u.loggedOut !== true) ? publicUser(u) : null;
  }

  async function getProfile(id) {
    const u = read(USER_KEY, null);
    if (u && norm(u.email) === norm(id)) return publicUser(u);
    const acc = accounts()[norm(id)];
    return acc ? { id: norm(id), name: acc.name, email: norm(id), onboarded: !!acc.onboarded } : null;
  }

  window.VYQ_AUTH = {
    isConfigured: () => true,
    friendlyError,
    signUp, signIn, signOut, getSession, getProfile, resetPassword
  };
})();
