/* VYQORLUNE — One-time migration from browser localStorage to Supabase.
 *
 * Requires window.VYQ_AUTH (js/auth.js) and an authenticated session.
 *
 * Guarantees:
 *  - Legacy keys (taskora.*) are READ ONLY. They are never deleted here.
 *  - Each record keeps its legacy id in `legacy_id`, and the unique
 *    (user_id, legacy_id) constraint makes re-running the migration safe:
 *    records are upserted, never duplicated.
 *  - A completion marker is written only after the cloud rows are read
 *    back and counted. A failed or partial run leaves the marker unset,
 *    so the next sign-in retries.
 *  - Nothing is migrated for an unauthenticated user.
 */
(function () {
  'use strict';

  const LEGACY = {
    user: 'taskora.user.v1',
    tasks: 'taskora.tasks.v1',
    projects: 'taskora.projects.v1',
    custom: 'taskora.custom.v1',
    plan: 'taskora.plan.v1'
  };

  /* Local per-browser marker so we don't re-check on every page load.
     The cloud is still the source of truth; this just avoids repeat work. */
  const MARKER_PREFIX = 'vyqorlune.migrated.v1.';

  function readLegacy(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* Legacy data is keyed per account: taskora.tasks.v1.<email>, or the bare key. */
  function legacyUserKey(base, email) {
    return email ? base + '.' + email : base;
  }

  function isValidHex(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  function normalizeDate(d) {
    if (!d || typeof d !== 'string') return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }

  function mapProject(p, userId) {
    return {
      user_id: userId,
      legacy_id: String(p.id),
      name: String(p.name || '').slice(0, 80) || 'Untitled project',
      description: String(p.description || '').slice(0, 300),
      color: isValidHex(p.color) ? p.color : '#2563eb'
    };
  }

  /* Values must match the app exactly: todo | in-progress | completed */
  function mapStatus(s) {
    if (s === 'completed' || s === 'in-progress' || s === 'todo') return s;
    return 'todo';
  }

  /* Values must match the app exactly: low | medium | high | urgent */
  function mapPriority(p) {
    return ['low', 'medium', 'high', 'urgent'].indexOf(p) !== -1 ? p : 'medium';
  }

  function mapTask(t, userId, projectUuidByLegacy) {
    const projectUuid = t.projectId != null ? (projectUuidByLegacy.get(String(t.projectId)) || null) : null;
    return {
      user_id: userId,
      legacy_id: String(t.id),
      project_id: projectUuid,
      title: String(t.title || '').slice(0, 120) || 'Untitled task',
      description: String(t.description || '').slice(0, 500),
      status: mapStatus(t.status),
      priority: mapPriority(t.priority),
      due_date: normalizeDate(t.dueDate)
    };
  }

  /** Read everything the old app stored for the given account. */
  function collectLegacy(email) {
    const tasks = readLegacy(legacyUserKey(LEGACY.tasks, email), readLegacy(LEGACY.tasks, []));
    const projects = readLegacy(legacyUserKey(LEGACY.projects, email), readLegacy(LEGACY.projects, []));
    return {
      tasks: Array.isArray(tasks) ? tasks : [],
      projects: Array.isArray(projects) ? projects : [],
      custom: readLegacy(LEGACY.custom, {}),
      legacyUser: readLegacy(LEGACY.user, null)
    };
  }

  /**
   * Migrate for the signed-in user. Returns a summary object.
   * Never throws for "nothing to migrate"; throws only on real failures.
   */
  async function migrateForUser(user) {
    if (!user || !user.id) throw new Error('Migration requires an authenticated user.');
    const client = window.VYQ_AUTH && window.VYQ_AUTH.client ? window.VYQ_AUTH.client : null;
    if (!client) throw new Error('Backend is not configured.');

    const marker = MARKER_PREFIX + user.id;
    if (localStorage.getItem(marker) === 'done') {
      return { skipped: true, reason: 'already migrated on this browser' };
    }

    const legacyEmail = (readLegacy(LEGACY.user, {}) || {}).email || user.email;
    const legacy = collectLegacy(legacyEmail);

    if (legacy.tasks.length === 0 && legacy.projects.length === 0) {
      /* Nothing local to move. Mark done so we don't re-check. Cloud data is untouched. */
      localStorage.setItem(marker, 'done');
      return { skipped: false, projects: 0, tasks: 0, verified: true };
    }

    /* 1) Projects first, so tasks can reference them. */
    const projectRows = legacy.projects.map(p => mapProject(p, user.id));
    if (projectRows.length) {
      const { error } = await client.from('projects')
        .upsert(projectRows, { onConflict: 'user_id,legacy_id' });
      if (error) throw new Error('Could not save projects: ' + error.message);
    }

    /* 2) Map legacy project ids → cloud uuids. */
    const { data: savedProjects, error: pErr } = await client.from('projects')
      .select('id,legacy_id')
      .eq('user_id', user.id)
      .not('legacy_id', 'is', null);
    if (pErr) throw new Error('Could not read back projects: ' + pErr.message);
    const projectUuidByLegacy = new Map(savedProjects.map(r => [r.legacy_id, r.id]));

    /* 3) Tasks. */
    const taskRows = legacy.tasks.map(t => mapTask(t, user.id, projectUuidByLegacy));
    if (taskRows.length) {
      const { error } = await client.from('tasks')
        .upsert(taskRows, { onConflict: 'user_id,legacy_id' });
      if (error) throw new Error('Could not save tasks: ' + error.message);
    }

    /* 4) Verify: every legacy id must now exist in the cloud. */
    const { data: cloudTasks, error: tErr } = await client.from('tasks')
      .select('legacy_id')
      .eq('user_id', user.id)
      .not('legacy_id', 'is', null);
    if (tErr) throw new Error('Could not verify tasks: ' + tErr.message);

    const cloudTaskIds = new Set(cloudTasks.map(r => r.legacy_id));
    const missingTasks = legacy.tasks.filter(t => !cloudTaskIds.has(String(t.id)));
    const missingProjects = legacy.projects.filter(p => !projectUuidByLegacy.has(String(p.id)));

    if (missingTasks.length || missingProjects.length) {
      /* Do NOT set the marker. Local data is intact, so the next sign-in retries. */
      throw new Error(
        'Verification failed: ' + missingTasks.length + ' task(s) and ' +
        missingProjects.length + ' project(s) did not reach the cloud. Local data was kept.'
      );
    }

    localStorage.setItem(marker, 'done');
    return {
      skipped: false,
      projects: legacy.projects.length,
      tasks: legacy.tasks.length,
      verified: true
    };
  }

  window.VYQ_MIGRATE = { migrateForUser, LEGACY, MARKER_PREFIX };
})();
