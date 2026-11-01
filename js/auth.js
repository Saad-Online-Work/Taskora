/* VYQORLUNE — Supabase authentication module
 *
 * Exposes window.VYQ_AUTH. Requires, in this order:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
 *   <script src="js/supabase-config.js"></script>
 *   <script src="js/auth.js"></script>
 *
 * No passwords are stored locally. Sessions are managed by Supabase and
 * persisted in localStorage by the Supabase client (key: sb-<ref>-auth-token).
 */
(function () {
  'use strict';

  const cfg = window.VYQ_SUPABASE_CONFIG;
  const configured =
    cfg &&
    typeof cfg.url === 'string' && cfg.url.startsWith('https://') && !cfg.url.includes('YOUR-PROJECT-REF') &&
    typeof cfg.anonKey === 'string' && cfg.anonKey.length > 20 && !cfg.anonKey.includes('YOUR-ANON');

  let client = null;
  if (configured && window.supabase) {
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,   // needed for password-reset and email-confirm links
        flowType: 'pkce'
      }
    });
  }

  /* Map Supabase error messages to friendly, honest text. */
  function friendlyError(err) {
    if (!err) return 'Something went wrong. Please try again.';
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (msg.includes('email not confirmed'))       return 'Please confirm your email first. Check your inbox for the link.';
    if (msg.includes('user already registered') || msg.includes('already been registered'))
      return 'An account with this email already exists. Try signing in instead.';
    if (msg.includes('password should be at least') || msg.includes('password is too short'))
      return 'Password is too short. Use at least 8 characters.';
    if (msg.includes('rate limit') || msg.includes('too many'))
      return 'Too many attempts. Please wait a few minutes and try again.';
    if (msg.includes('failed to fetch') || msg.includes('network'))
      return 'Network problem. Check your connection and try again.';
    return err.message || 'Something went wrong. Please try again.';
  }

  function requireClient() {
    if (!client) {
      throw new Error('Backend is not configured yet. Add your Supabase URL and anon key to js/supabase-config.js.');
    }
    return client;
  }

  const VYQ_AUTH = {
    isConfigured: () => !!client,
    /** Exposed for the migration and data modules. Uses only the public anon key. */
    get client() { return client; },
    friendlyError,

    /** Create an account. Supabase sends a confirmation email if enabled. */
    async signUp({ name, email, password, redirectTo }) {
      const { data, error } = await requireClient().auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: redirectTo
        }
      });
      if (error) throw error;
      return data; // data.session is null when email confirmation is required
    },

    async signIn({ email, password }) {
      const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      const { error } = await requireClient().auth.signOut();
      if (error) throw error;
    },

    /** Sends a reset email. Always resolves the same way so emails can't be enumerated. */
    async requestPasswordReset({ email, redirectTo }) {
      const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },

    /** Only valid while the user is in a recovery session from the reset link. */
    async updatePassword(newPassword) {
      const { error } = await requireClient().auth.updateUser({ password: newPassword });
      if (error) throw error;
    },

    async getSession() {
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    /** Returns the current user or null. Never reads from localStorage directly. */
    async getUser() {
      const session = await this.getSession();
      return session ? session.user : null;
    },

    /** Subscribe to sign-in / sign-out / token refresh / recovery events. */
    onAuthChange(callback) {
      if (!client) return () => {};
      const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
      return () => data.subscription.unsubscribe();
    },

    /** Load profile row (name, plan, onboarded flag). */
    async getProfile(userId) {
      const { data, error } = await requireClient()
        .from('profiles')
        .select('id,name,plan,onboarded,onboarding_data,created_at')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },

    async updateProfile(userId, patch) {
      const { data, error } = await requireClient()
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    /**
     * Guard for protected pages. Redirects to signin.html when there is no
     * real session. Resolves with { session, profile } when access is allowed.
     */
    async requireSession({ redirectTo = 'signin.html' } = {}) {
      if (!client) {
        window.location.replace(redirectTo);
        return new Promise(() => {}); // never resolves; page is leaving
      }
      const session = await this.getSession();
      if (!session) {
        window.location.replace(redirectTo);
        return new Promise(() => {});
      }
      const profile = await this.getProfile(session.user.id);
      return { session, profile };
    }
  };

  window.VYQ_AUTH = VYQ_AUTH;
})();
