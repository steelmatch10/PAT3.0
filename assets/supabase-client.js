// PAT 3.0 — Supabase Client & Data Helpers
// Depends on: supabase-config.js (loaded first), Supabase CDN script

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth ──────────────────────────────────────────────────────────────────────

async function patSignIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function patSignOut() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

async function patGetSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

/**
 * Redirects to login.html if not authenticated.
 * Redirects to mfa-challenge.html if the user has a verified MFA factor but the
 * current session is only AAL1 — Supabase does NOT auto-block AAL1 sessions for
 * MFA-enrolled users (confirmed empirically), so the app must gate it here.
 * Returns the current user object if authenticated and at the required AAL.
 */
async function initAuth() {
  const session = await patGetSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  const onChallengePage = window.location.pathname.endsWith('mfa-challenge.html');
  if (!onChallengePage) {
    const { data: aal, error: aalError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aalError && aal.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
      const returnTo = window.location.pathname.split('/').pop() + window.location.search;
      window.location.href = 'mfa-challenge.html?returnTo=' + encodeURIComponent(returnTo);
      return null;
    }
  }

  return session.user;
}

/**
 * Returns the team_member record for the current user (includes global_role).
 * Cached in window._patCurrentMember after first call.
 */
async function getCurrentMember() {
  if (window._patCurrentMember) return window._patCurrentMember;
  const session = await patGetSession();
  if (!session) return null;
  const { data, error } = await supabaseClient
    .from('team_members')
    .select('*')
    .eq('user_id', session.user.id)
    .single();
  if (error) { console.error('getCurrentMember:', error.message); return null; }
  window._patCurrentMember = data;
  return data;
}

/** Returns true if the current user is a founder. */
async function isFounder() {
  const member = await getCurrentMember();
  return member?.global_role === 'founder';
}

/**
 * Given a list of user ids (e.g. distinct scenarios.created_by values), returns
 * a Set of the ones whose CURRENT global_role is 'investor'. Used to badge
 * investor-created scenarios. Reflects current role, not role at the time the
 * scenario was created — a promoted/demoted/removed user's historical scenarios
 * will follow their current status (or stop showing a badge if they're removed
 * from team_members entirely). This is a documented, accepted limitation, not a bug.
 */
async function fetchInvestorCreatorIds(userIds) {
  const distinctIds = [...new Set((userIds || []).filter(Boolean))];
  if (distinctIds.length === 0) return new Set();
  const { data, error } = await supabaseClient
    .from('team_members')
    .select('user_id')
    .in('user_id', distinctIds)
    .eq('global_role', 'investor');
  if (error) { console.error('fetchInvestorCreatorIds:', error.message); return new Set(); }
  return new Set((data || []).map(row => row.user_id));
}

// ── Security Settings (password + MFA) ─────────────────────────────────────────

/**
 * Re-authenticates the current user by password before a sensitive change
 * (password update, MFA unenroll). Proves the caller knows the current
 * password, not just that they hold a valid session. Note: this calls
 * signInWithPassword again, which may refresh the SDK's stored session
 * tokens for the same user — that's expected and harmless here since the
 * immediately-following updateUser() call needs a valid session anyway.
 */
async function patReauthenticate(email, currentPassword) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: currentPassword });
  return { error };
}

/** Updates the current user's password. Call patReauthenticate first. */
async function patUpdatePassword(newPassword) {
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  return { error };
}

/** Signs out of all sessions/devices for the current user, not just this one. */
async function patSignOutEverywhere() {
  await supabaseClient.auth.signOut({ scope: 'global' });
  window.location.href = 'login.html';
}

/**
 * Begins TOTP enrollment. Returns { data, error }; data.totp.qr_code is an SVG string,
 * data.totp.secret is the manual-entry fallback. Each call uses a unique friendlyName —
 * Supabase rejects a second enroll with a name that collides with an existing factor for
 * the same user (including abandoned/unverified ones), so a fixed/empty name would block
 * retries after a failed or abandoned attempt.
 */
async function patMfaEnroll() {
  const { data, error } = await supabaseClient.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${Date.now()}`,
  });
  return { data, error };
}

/** Creates a challenge for a given factor (needed before verify). */
async function patMfaChallenge(factorId) {
  const { data, error } = await supabaseClient.auth.mfa.challenge({ factorId });
  return { data, error };
}

/** Verifies a 6-digit code against a challenge, completing enrollment or step-up. */
async function patMfaVerify(factorId, challengeId, code) {
  const { data, error } = await supabaseClient.auth.mfa.verify({ factorId, challengeId, code });
  return { data, error };
}

/** Lists all MFA factors for the current user. */
async function patMfaListFactors() {
  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  return { data, error };
}

/** Removes an MFA factor. Caller should confirm via a type-to-confirm modal first. */
async function patMfaUnenroll(factorId) {
  const { error } = await supabaseClient.auth.mfa.unenroll({ factorId });
  return { error };
}

// ── Properties ────────────────────────────────────────────────────────────────

/**
 * Fetch all non-deleted properties the current user can see.
 * RLS enforces visibility — founders see all, investors see approved only.
 * Also returns scenario_count via a subquery join.
 */
async function fetchProperties() {
  const { data, error } = await supabaseClient
    .from('properties')
    .select(`
      id,
      street,
      city,
      state,
      zip,
      zillow_link,
      notes,
      created_at,
      updated_at,
      pinned,
      listing_status,
      archived_at,
      archive_reason,
      scenarios(module, updated_at, archived_at, created_by)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) { console.error('fetchProperties:', error.message); return []; }

  const properties = (data || []).map(p => {
    const allScenarios = p.scenarios || [];
    const active = allScenarios.filter(s => !s.archived_at);
    const latest = active.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    return {
      ...p,
      scenario_count: allScenarios.length,
      latest_module: latest?.module || 'GRASP',
    };
  });

  // Resolve which scenario creators are investors, then flag any property with
  // at least one investor-created scenario (reflects creators' CURRENT role).
  const allCreatorIds = properties.flatMap(p => (p.scenarios || []).map(s => s.created_by));
  const investorCreatorIds = await fetchInvestorCreatorIds(allCreatorIds);
  return properties.map(p => ({
    ...p,
    has_investor_created_scenario: (p.scenarios || []).some(s => investorCreatorIds.has(s.created_by)),
  }));
}

/**
 * Returns the set of property IDs the current investor has approved access to.
 * For founders this always returns null (they have universal access).
 */
async function fetchApprovedPropertyIds() {
  const { data, error } = await supabaseClient
    .from('property_access')
    .select('property_id')
    .eq('user_id', (await patGetSession()).user.id)
    .not('access_approved_at', 'is', null);
  if (error) { console.error('fetchApprovedPropertyIds:', error.message); return new Set(); }
  return new Set((data || []).map(r => r.property_id));
}

async function fetchProperty(propertyId) {
  const { data, error } = await supabaseClient
    .from('properties')
    .select('id, street, city, state, zip, zillow_link, income_efficiency, property_management_cut, listing_status, archived_at, archive_reason')
    .eq('id', propertyId)
    .single();
  if (error) { console.error('fetchProperty:', error.message); return null; }
  return data;
}

async function updatePropertyIncomeEfficiency(propertyId, value) {
  const { error } = await supabaseClient
    .from('properties')
    .update({ income_efficiency: value })
    .eq('id', propertyId);
  if (error) { console.error('updatePropertyIncomeEfficiency:', error.message); }
}

async function updatePropertyManagementCut(propertyId, value) {
  const { error } = await supabaseClient
    .from('properties')
    .update({ property_management_cut: value })
    .eq('id', propertyId);
  if (error) { console.error('updatePropertyManagementCut:', error.message); }
}

async function updatePropertyZillowLink(propertyId, link) {
  const { error } = await supabaseClient
    .from('properties')
    .update({ zillow_link: link || null })
    .eq('id', propertyId);
  if (error) { console.error('updatePropertyZillowLink:', error.message); }
}

async function updatePropertyAddress(propertyId, { street, city, state, zip }) {
  const { error } = await supabaseClient
    .from('properties')
    .update({ street, city, state, zip })
    .eq('id', propertyId);
  if (error) { console.error('updatePropertyAddress:', error.message); }
}

function formatAddress({ street, city, state, zip }) {
  return `${street}, ${city}, ${state} ${zip}`;
}

async function createProperty({ street, city, state, zip }, zillowLink) {
  const { data, error } = await supabaseClient
    .from('properties')
    .insert({ street, city, state, zip, zillow_link: zillowLink || null })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function togglePinProperties(propertyIds, pinned) {
  const { error } = await supabaseClient
    .from('properties')
    .update({ pinned })
    .in('id', propertyIds);
  if (error) throw error;
}

/**
 * Archive a property: records archived_at + a required reason, and
 * optionally updates the listing status at the same time.
 * Does not remove the property — see hardDeleteProperty() for permanent removal.
 */
async function archiveProperty(propertyId, reason, status) {
  const updates = {
    archived_at: new Date().toISOString(),
    archive_reason: reason,
  };
  if (status) updates.listing_status = status;
  const { error } = await supabaseClient
    .from('properties')
    .update(updates)
    .eq('id', propertyId);
  if (error) throw error;
}

/**
 * Permanently delete a property and all of its scenarios.
 * Irreversible — no soft-delete fallback.
 */
async function hardDeleteProperty(propertyId) {
  const { error: scenarioError } = await supabaseClient
    .from('scenarios')
    .delete()
    .eq('property_id', propertyId);
  if (scenarioError) throw scenarioError;

  const { error: propertyError } = await supabaseClient
    .from('properties')
    .delete()
    .eq('id', propertyId);
  if (propertyError) throw propertyError;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

/**
 * Fetch all non-archived scenarios for a property.
 */
async function fetchScenarios(propertyId) {
  const { data, error } = await supabaseClient
    .from('scenarios')
    .select('*')
    .eq('property_id', propertyId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchScenarios:', error.message); return []; }
  return data || [];
}

/**
 * Fetch all scenarios for a property including archived ones.
 */
async function fetchScenariosAll(propertyId) {
  const { data, error } = await supabaseClient
    .from('scenarios')
    .select('*')
    .eq('property_id', propertyId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchScenariosAll:', error.message); return []; }
  return data || [];
}

/**
 * Create a new scenario.
 * scenarioData: { scenario_name, scenario_description, bedrooms_or_units,
 *                 calculate_per_bedroom, inputs, computed, bands, bedroom_details }
 */
async function createScenario(propertyId, scenarioData) {
  const { data, error } = await supabaseClient
    .from('scenarios')
    .insert({ property_id: propertyId, module: 'GRASP', ...scenarioData })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Update an existing scenario (recalculates computed + bands on the client before calling).
 */
async function updateScenario(scenarioId, scenarioData) {
  const { data, error } = await supabaseClient
    .from('scenarios')
    .update({ ...scenarioData, updated_at: new Date().toISOString() })
    .eq('id', scenarioId)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Soft-archive a scenario (sets archived_at). Does not delete.
 */
async function archiveScenario(scenarioId) {
  const { error } = await supabaseClient
    .from('scenarios')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', scenarioId);
  if (error) throw error;
}

/**
 * Restore an archived scenario (clears archived_at).
 */
async function restoreScenario(scenarioId) {
  const { error } = await supabaseClient
    .from('scenarios')
    .update({ archived_at: null })
    .eq('id', scenarioId);
  if (error) throw error;
}

/**
 * Recompute all active GRASP scenarios and flush updated computed + bands to Supabase.
 * Called once at login — runs in the background, does not block page render.
 * Also pulls each property's income_efficiency so DSCR guidance uses the correct value.
 */
async function recomputeAllScenarios() {
  // Fetch all active GRASP scenarios with their property's income_efficiency in one query
  const { data: scenarios, error } = await supabaseClient
    .from('scenarios')
    .select('id, inputs, computed, bedrooms_or_units, bedroom_details, calculate_per_bedroom, properties(income_efficiency, property_management_cut)')
    .eq('module', 'GRASP')
    .is('archived_at', null);

  if (error) { console.error('recomputeAllScenarios fetch:', error.message); return; }
  if (!scenarios || scenarios.length === 0) return;

  const updates = scenarios.map(s => {
    const inp = s.inputs || {};
    const incomeEfficiencyPct = s.properties?.income_efficiency ?? 80;
    const propertyManagementCutPct = s.properties?.property_management_cut ?? 10;
    // inputs stores taxesAnnual; computeAll expects taxesMonthly
    const taxesMonthly = (inp.taxesAnnual ?? 0) / 12;

    // Derive rentPerUnitMonthly: prefer stored input, then bedroom_details, then legacy grossRentMonthly
    let rentPerUnitMonthly = 0;
    if (inp.rentPerUnitMonthly != null) {
      rentPerUnitMonthly = inp.rentPerUnitMonthly;
    } else if (s.calculate_per_bedroom && s.bedroom_details?.length) {
      const total = s.bedroom_details.reduce((sum, b) => sum + (b.bedroomRent || 0), 0);
      rentPerUnitMonthly = s.bedrooms_or_units > 0 ? total / s.bedrooms_or_units : 0;
    } else {
      const grossRent = s.computed?.grossRentMonthly || 0;
      rentPerUnitMonthly = s.bedrooms_or_units > 0 ? grossRent / s.bedrooms_or_units : 0;
    }

    const result = computeAll({
      ...inp,
      taxesMonthly,
      rentPerUnitMonthly,
      bedroomsOrUnits: s.bedrooms_or_units,
      incomeEfficiencyPct,
      propertyManagementCutPct,
    });
    return {
      id: s.id,
      computed: result.computed,
      bands: result.bands,
      updated_at: new Date().toISOString(),
    };
  });

  // Write updates in parallel (each is a single-row update; small fleet so no chunking needed)
  await Promise.allSettled(
    updates.map(u =>
      supabaseClient.from('scenarios').update({
        computed: u.computed,
        bands: u.bands,
        updated_at: u.updated_at,
      }).eq('id', u.id)
    )
  );
}
