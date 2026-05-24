#!/usr/bin/env node
/**
 * PAT 3.0 — FRAT Cleanup Script
 *
 * Deletes all scenarios + properties that were inserted by 08_migrate_frat.js
 * so a clean re-run can be performed. Targets only the known FRAT addresses;
 * will not touch any other data.
 *
 * Usage:
 *   node migration/09_cleanup_frat.js          ← dry run (default)
 *   DRY_RUN=false node migration/09_cleanup_frat.js  ← live delete
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
const DRY_RUN = process.env.DRY_RUN !== 'false';  // default: dry run

// Exact addresses as inserted by 08_migrate_frat.js (after normalization)
const FRAT_ADDRESSES = [
  '11 Randolphville Road',
  '30 Bender Avenue',
  '693 Hanson Avenue',
  '913 Eden Avenue',
  '6 Lufberry Avenue',
];

async function main() {
  console.log('PAT 3.0 FRAT Cleanup');
  console.log('====================');
  if (DRY_RUN) console.log('[DRY RUN — no deletes will occur]\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL/SUPABASE_PROJECT_ID and SUPABASE_SERVICE_KEY/SUPABASE_SECRET_SERVICE_ROLE must be set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Look up property IDs for the known addresses
  const { data: properties, error: fetchErr } = await supabase
    .from('properties')
    .select('id, address')
    .in('address', FRAT_ADDRESSES);

  if (fetchErr) { console.error('ERROR fetching properties:', fetchErr.message); process.exit(1); }

  if (!properties || properties.length === 0) {
    console.log('No matching properties found — nothing to clean up.');
    return;
  }

  console.log(`Found ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} to delete:`);
  properties.forEach(p => console.log(`  • ${p.address} (${p.id})`));

  const ids = properties.map(p => p.id);

  // 2. Delete scenarios first (FK constraint)
  const { data: scenariosDeleted, error: scenErr } = DRY_RUN
    ? { data: null, error: null }
    : await supabase.from('scenarios').delete().in('property_id', ids).select('id');

  if (scenErr) { console.error('ERROR deleting scenarios:', scenErr.message); process.exit(1); }

  // 3. Delete properties
  const { data: propsDeleted, error: propErr } = DRY_RUN
    ? { data: null, error: null }
    : await supabase.from('properties').delete().in('id', ids).select('id');

  if (propErr) { console.error('ERROR deleting properties:', propErr.message); process.exit(1); }

  console.log('');
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would delete ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} and their scenarios.`);
    console.log('Set DRY_RUN=false to execute.');
  } else {
    console.log(`Deleted ${propsDeleted?.length ?? '?'} propert${(propsDeleted?.length ?? 0) === 1 ? 'y' : 'ies'} and their scenarios.`);
    console.log('Re-run 08_migrate_frat.js to insert corrected data.');
  }
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
