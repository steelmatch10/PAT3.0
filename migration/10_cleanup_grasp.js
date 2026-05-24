#!/usr/bin/env node
/**
 * PAT 3.0 — GRASP Cleanup Script
 *
 * Deletes all scenarios + properties that originated from the PAT 2.0
 * CSV (02_migrate.js) so a corrected re-run can be performed.
 * Targets by module='GRASP' on scenarios, then deletes the parent
 * properties that have no remaining scenarios.
 *
 * Safe: only removes properties whose ALL scenarios are GRASP and
 * were created by the founder (migration user). Will not touch
 * manually-created properties or FRAT records.
 *
 * Usage:
 *   node migration/10_cleanup_grasp.js          ← dry run (default)
 *   DRY_RUN=false node migration/10_cleanup_grasp.js  ← live delete
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env from project root
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([^#=][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL ||
  (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : null);
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_SERVICE_ROLE;
const FOUNDER_USER_ID = process.env.FOUNDER_USER_ID;
const DRY_RUN = process.env.DRY_RUN !== 'false';  // default: dry run

async function main() {
  console.log('PAT 3.0 GRASP Cleanup');
  console.log('=====================');
  if (DRY_RUN) console.log('[DRY RUN — no deletes will occur]\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL/SUPABASE_PROJECT_ID and service key must be set.');
    process.exit(1);
  }
  if (!FOUNDER_USER_ID) {
    console.error('ERROR: FOUNDER_USER_ID must be set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find all properties created by the founder that have only GRASP scenarios
  // Step 1: get all GRASP scenario property_ids created by founder
  const { data: graspScenarios, error: scenFetchErr } = await supabase
    .from('scenarios')
    .select('property_id')
    .eq('module', 'GRASP')
    .eq('created_by', FOUNDER_USER_ID);

  if (scenFetchErr) { console.error('ERROR fetching scenarios:', scenFetchErr.message); process.exit(1); }
  if (!graspScenarios?.length) { console.log('No GRASP scenarios found — nothing to clean up.'); return; }

  const graspPropertyIds = [...new Set(graspScenarios.map(s => s.property_id))];

  // Step 2: confirm none of those properties have non-GRASP scenarios
  const { data: allScenarios, error: allScenErr } = await supabase
    .from('scenarios')
    .select('property_id, module')
    .in('property_id', graspPropertyIds);

  if (allScenErr) { console.error('ERROR fetching all scenarios:', allScenErr.message); process.exit(1); }

  const mixedPropertyIds = new Set(
    allScenarios.filter(s => s.module !== 'GRASP').map(s => s.property_id)
  );
  const safeToDelete = graspPropertyIds.filter(id => !mixedPropertyIds.has(id));
  const skipped = graspPropertyIds.filter(id => mixedPropertyIds.has(id));

  if (skipped.length) {
    console.log(`Skipping ${skipped.length} properties with mixed modules (GRASP + other) — manual review needed.`);
  }

  // Step 3: look up addresses for reporting
  const { data: properties, error: propFetchErr } = await supabase
    .from('properties')
    .select('id, address')
    .in('id', safeToDelete);

  if (propFetchErr) { console.error('ERROR fetching property details:', propFetchErr.message); process.exit(1); }

  console.log(`Found ${properties.length} GRASP-only propert${properties.length === 1 ? 'y' : 'ies'} to delete:`);
  properties.forEach(p => console.log(`  • ${p.address} (${p.id})`));

  if (!properties.length) { console.log('Nothing to delete.'); return; }

  // Step 4: delete scenarios then properties
  const { error: scenDelErr } = DRY_RUN
    ? { error: null }
    : await supabase.from('scenarios').delete().in('property_id', safeToDelete);
  if (scenDelErr) { console.error('ERROR deleting scenarios:', scenDelErr.message); process.exit(1); }

  const { data: propsDeleted, error: propDelErr } = DRY_RUN
    ? { data: null, error: null }
    : await supabase.from('properties').delete().in('id', safeToDelete).select('id');
  if (propDelErr) { console.error('ERROR deleting properties:', propDelErr.message); process.exit(1); }

  console.log('');
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would delete ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} and all their GRASP scenarios.`);
    console.log('Set DRY_RUN=false to execute.');
  } else {
    console.log(`Deleted ${propsDeleted?.length ?? '?'} propert${(propsDeleted?.length ?? 0) === 1 ? 'y' : 'ies'} and their GRASP scenarios.`);
    console.log('Re-run 02_migrate.js to insert corrected data.');
  }
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
