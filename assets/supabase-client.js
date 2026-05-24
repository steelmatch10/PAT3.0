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
 * Returns the current user object if authenticated.
 */
async function initAuth() {
  const session = await patGetSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
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
      address,
      zillow_link,
      notes,
      created_at,
      updated_at,
      pinned,
      scenarios(module, updated_at, archived_at)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) { console.error('fetchProperties:', error.message); return []; }
  return (data || []).map(p => {
    const allScenarios = p.scenarios || [];
    const active = allScenarios.filter(s => !s.archived_at);
    const latest = active.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    return {
      ...p,
      scenario_count: allScenarios.length,
      latest_module: latest?.module || 'GRASP',
    };
  });
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
    .select('id, address, zillow_link')
    .eq('id', propertyId)
    .single();
  if (error) { console.error('fetchProperty:', error.message); return null; }
  return data;
}

async function createProperty(address, zillowLink) {
  const { data, error } = await supabaseClient
    .from('properties')
    .insert({ address, zillow_link: zillowLink || null })
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

async function softDeleteProperty(propertyId) {
  const { error } = await supabaseClient
    .from('properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', propertyId);
  if (error) throw error;
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
