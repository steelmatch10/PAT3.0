#!/usr/bin/env node
/**
 * PAT 3.0 — FRAT CSV → Supabase Migration Script
 *
 * Prerequisites:
 *   npm install @supabase/supabase-js csv-parse
 *
 * Usage:
 *   node migration/08_migrate_frat.js
 *
 * Required env vars (or set directly below in CONFIG):
 *   SUPABASE_URL          — from Supabase dashboard > Settings > API
 *   SUPABASE_SERVICE_KEY  — use the service_role key (bypasses RLS for migration)
 *   FOUNDER_USER_ID       — UUID of dmalde1998@gmail.com from Supabase Auth
 *
 * Dry run (preview without writing):
 *   DRY_RUN=true node migration/08_migrate_frat.js
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const CONFIG = {
  SUPABASE_URL:         process.env.SUPABASE_URL         || 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_SERVICE_ROLE || 'YOUR_SERVICE_ROLE_KEY',
  FOUNDER_USER_ID:      process.env.FOUNDER_USER_ID      || 'YOUR_FOUNDER_UUID',
  CSV_PATH: path.join(__dirname, 'Property Analysis Tools (PAT) - NJ FRAT 1.0.csv'),
  DRY_RUN: process.env.DRY_RUN === 'true',
};

// ── CONSTANTS (mirrors frat.js) ────────────────────────────────────────────────
const CONSTANTS = {
  CLOSING_COSTS_PERCENT: 0.05,   // 5% of acquisition value
  DEFAULT_LOAN_LENGTH:   30,     // years
  ROI_TARGETS: [0.40, 0.30, 0.20, 0.10],
  ROI_BANDS: [0.30, 0.20, 0.10], // Great ≥30%, Good ≥20%, Okay ≥10%, Bad <10%
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseCurrency(s) {
  if (!s || s.trim() === '') return 0;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}
function parsePct(s) {
  if (!s || s.trim() === '') return 0;
  const n = parseFloat(s.replace(/%/g, ''));
  return isNaN(n) ? 0 : n;
}
function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function bandROI(v) {
  if (!isFinite(v)) return 'N/A';
  if (v >= CONSTANTS.ROI_BANDS[0]) return 'Great';
  if (v >= CONSTANTS.ROI_BANDS[1]) return 'Good';
  if (v >= CONSTANTS.ROI_BANDS[2]) return 'Okay';
  return 'Bad';
}

/**
 * FRAT core computation — mirrors PAT 2.0 formulas exactly.
 * taxesMonthly must already be in monthly form (inputs.taxesAnnual / 12).
 *
 * Formula source: PAT 2.0 FRAT workbook
 *
 * Step 1 — Purchase & financing
 *   moneyDown        = acquisitionValue × percentDown
 *   closingCosts     = acquisitionValue × 0.05
 *   totalPurchaseCap = moneyDown + closingCosts + estFixingCost
 *   loanAmount       = acquisitionValue + estFixingCost − moneyDown
 *
 * Step 2 — Mortgage (standard PMT)
 *   mortgageMonthly  = loanAmount × r / (1 − (1 + r)^−n)
 *
 * Step 3 — Monthly carrying costs
 *   recurringMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + mortgageMonthly
 *
 * Step 4 — Total investment (upfront + carry for hold period)
 *   totalInvestment  = totalPurchaseCap + (recurringMonthly × monthsHold)
 *
 * Step 5 — Profit & ROI
 *   netProfit        = desiredARV − totalInvestment − loanAmount
 *   roi              = netProfit / (totalInvestment + loanAmount)
 *
 * Step 6 — Target resale values
 *   arvForROI(pct)   = (totalInvestment + loanAmount) × (1 + pct)
 */
function computeAll(input) {
  const acquisitionValue  = toNum(input.propertyValue);
  const estFixingCost     = toNum(input.estFixingCost);
  const percentDown       = toNum(input.percentDownPct) / 100;
  const rateApr           = toNum(input.rateAprPct) / 100;
  const loanYears         = toNum(input.loanLengthYears || CONSTANTS.DEFAULT_LOAN_LENGTH);
  const taxesMonthly      = toNum(input.taxesMonthly);
  const insuranceMonthly  = toNum(input.insuranceMonthly);
  const hoaMonthly        = toNum(input.hoaMonthly);
  const monthsHold        = toNum(input.monthsHold);
  const desiredARV        = toNum(input.desiredARV);

  // Step 1
  const moneyDown        = acquisitionValue * percentDown;
  const closingCosts     = acquisitionValue * CONSTANTS.CLOSING_COSTS_PERCENT;
  const totalPurchaseCap = moneyDown + closingCosts + estFixingCost;
  const loanAmount       = acquisitionValue + estFixingCost - moneyDown;

  // Step 2 — PMT
  const r = rateApr / 12;
  const n = loanYears * 12;
  let mortgageMonthly = 0;
  if (r === 0) {
    mortgageMonthly = n > 0 ? loanAmount / n : 0;
  } else {
    const denom = 1 - Math.pow(1 + r, -n);
    mortgageMonthly = denom !== 0 ? loanAmount * r / denom : 0;
  }

  // Step 3
  const recurringMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + mortgageMonthly;

  // Step 4
  const holdCosts       = recurringMonthly * monthsHold;
  const totalInvestment = totalPurchaseCap + holdCosts;

  // Step 5
  const totalOutlay = totalInvestment + loanAmount;
  const netProfit   = desiredARV - totalOutlay;
  const roi         = totalOutlay > 0 ? netProfit / totalOutlay : NaN;

  // Step 6 — target resale values for each ROI tier
  const suggestedARV = {};
  for (const target of CONSTANTS.ROI_TARGETS) {
    const key = `roi${Math.round(target * 100)}`;
    suggestedARV[key] = totalOutlay * (1 + target);
  }

  const computed = {
    moneyDown,
    closingCosts,
    totalPurchaseCap,
    loanAmount,
    mortgageMonthly,
    recurringMonthly,
    holdCosts,
    totalInvestment,
    netProfit,
    roi,
    suggestedARV,  // { roi40, roi30, roi20, roi10 }
  };

  const bands = {
    roi: bandROI(roi),
  };

  return { computed, bands };
}

// ── VALIDATION (runs in dry-run mode) ─────────────────────────────────────────
// Expected: 11 Randolphville Road — PAT 2.0 values
function runValidation() {
  const result = computeAll({
    propertyValue:  275000,
    estFixingCost:  100000,
    percentDownPct: 20,
    rateAprPct:     8,
    loanLengthYears: 30,
    taxesMonthly:   437.75,
    insuranceMonthly: 0,
    hoaMonthly:     0,
    monthsHold:     5,
    desiredARV:     500000,
  });

  const c = result.computed;
  const checks = [
    ['Money Down',         c.moneyDown,        55000,    50],
    ['Closing Costs',      c.closingCosts,     13750,    50],
    ['Total Purchase Cap', c.totalPurchaseCap, 168750,   50],
    ['Loan Amount',        c.loanAmount,       320000,   50],
    ['Mortgage Monthly',   c.mortgageMonthly,  2348.05,  1],   // PMT(8%/12, 360, 320000) = 2348.05; PAT 2.0 doc shows 2345.22 (minor transcription diff)
    ['Recurring Monthly',  c.recurringMonthly, 2783,     5],
    ['Hold Costs (5mo)',   c.holdCosts,        13916,    50],
    ['Total Investment',   c.totalInvestment,  182666,   100],
    ['Net Profit',         c.netProfit,        -2666,    100],
  ];

  let passed = 0;
  console.log('\n  Validation — 11 Randolphville Road:');
  for (const [label, actual, expected, tolerance] of checks) {
    const ok = Math.abs(actual - expected) <= tolerance;
    console.log(`    ${ok ? '✓' : '✗'} ${label}: ${actual.toFixed(2)} (expected ~${expected})`);
    if (ok) passed++;
  }
  console.log(`\n  ${passed}/${checks.length} checks passed`);
  if (passed < checks.length) {
    console.error('\n  [WARNING] Some validation checks failed — review formulas before running live.');
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('PAT 3.0 FRAT Migration');
  console.log('======================');
  if (CONFIG.DRY_RUN) {
    console.log('[DRY RUN — no writes will occur]\n');
    runValidation();
    console.log('');
  }

  if (!CONFIG.SUPABASE_URL.includes('supabase.co') && !CONFIG.DRY_RUN) {
    console.error('ERROR: Set SUPABASE_URL env var or fill in CONFIG above.');
    process.exit(1);
  }
  if (CONFIG.FOUNDER_USER_ID.startsWith('YOUR_') && !CONFIG.DRY_RUN) {
    console.error('ERROR: Set FOUNDER_USER_ID env var. Get it from Supabase Auth > Users.');
    process.exit(1);
  }

  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

  const csvText = fs.readFileSync(CONFIG.CSV_PATH, 'utf8');
  // Row 1: metadata ("Default = Monthly,..."), Row 2: column headers, Row 3+: data
  const rows = parse(csvText, {
    skip_empty_lines: true,
    relax_column_count: true,
    from_line: 2,  // skip metadata row; row 2 becomes index 0 after parse
  });

  // Keep raw headers (some have trailing spaces in the CSV) and match with trim in col()
  const headers = rows[0];
  // Skip blank rows: must have an address AND a non-zero acquisition value
  const dataRows = rows.slice(1).filter(r => {
    const addr = (r[0] || '').trim();
    const acq  = parseCurrency(r[1] || '');
    return addr !== '' && acq > 0;
  });

  console.log(`CSV: ${dataRows.length} data rows after filtering blanks\n`);

  const col = (name) => {
    const i = headers.findIndex(h => h.trim() === name.trim());
    if (i === -1) throw new Error(`Column not found: "${name}"`);
    return i;
  };

  const CI = {
    address:       col('Property Location (w/ Link)'),
    propertyValue: col('Acquisition Value'),
    estFixingCost: col('Flipping Estimate'),
    percentDown:   col('Percent Down'),
    loanLength:    col('Loan Length'),
    rate:          col('Rate'),
    taxes:         col('Taxes'),
    insurance:     col('Insurance'),
    hoa:           col('HOA'),
    monthsHold:    col('Months Till Resale'),
    desiredARV:    col('Desired Resale Value'),
  };

  const propertyMap = new Map();  // address → propertyId
  let propertyInsertCount = 0;
  let scenarioInsertCount = 0;
  let skipCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];

    const rawAddress = (row[CI.address] || '').trim()
      .replace(/\bSt\b\.?$/i, 'Street')
      .replace(/\bAve\b\.?$/i, 'Avenue')
      .replace(/\bDr\b\.?$/i, 'Drive')
      .replace(/\bRd\b\.?$/i, 'Road')
      .replace(/\bBlvd\b\.?$/i, 'Boulevard')
      .trim();

    if (!rawAddress) {
      skipCount++;
      continue;
    }

    // ── Parse inputs ──────────────────────────────────────────────────────────
    const propertyValue   = parseCurrency(row[CI.propertyValue]);
    const estFixingCost   = parseCurrency(row[CI.estFixingCost]);
    const percentDownPct  = parsePct(row[CI.percentDown]);
    const rateAprPct      = parsePct(row[CI.rate]);
    const loanLengthYears = toNum(row[CI.loanLength]) || CONSTANTS.DEFAULT_LOAN_LENGTH;
    // CSV header says "Default = Monthly" — store as annual per PAT 3.0 convention
    const taxesMonthlyRaw = parseCurrency(row[CI.taxes]);
    const taxesAnnual     = taxesMonthlyRaw * 12;
    const insuranceMonthly = parseCurrency(row[CI.insurance]);
    const hoaMonthly      = parseCurrency(row[CI.hoa]);
    const monthsHold      = toNum(row[CI.monthsHold]) || 0;
    const desiredARV      = parseCurrency(row[CI.desiredARV]);

    // ── inputs JSONB ──────────────────────────────────────────────────────────
    const inputs = {
      propertyValue,
      estFixingCost,
      percentDownPct,
      rateAprPct,
      loanLengthYears,
      taxesAnnual,       // stored annually; divide by 12 before computeAll
      insuranceMonthly,
      hoaMonthly,
      monthsHold,
      desiredARV,
    };

    // ── Compute KPIs ──────────────────────────────────────────────────────────
    const { computed, bands } = computeAll({
      ...inputs,
      taxesMonthly: taxesAnnual / 12,
    });

    // ── Upsert property ────────────────────────────────────────────────────────
    let propertyId;
    if (propertyMap.has(rawAddress)) {
      propertyId = propertyMap.get(rawAddress);
    } else {
      console.log(`  [PROPERTY] "${rawAddress}"`);
      if (!CONFIG.DRY_RUN) {
        const { data, error } = await supabase
          .from('properties')
          .upsert(
            { address: rawAddress, created_by: CONFIG.FOUNDER_USER_ID },
            { onConflict: 'address', ignoreDuplicates: false }
          )
          .select('id')
          .single();

        if (error) {
          console.error(`    ERROR inserting property: ${error.message}`);
          skipCount++;
          continue;
        }
        propertyId = data.id;
      } else {
        propertyId = `dry-run-property-${propertyMap.size + 1}`;
      }
      propertyMap.set(rawAddress, propertyId);
      propertyInsertCount++;
    }

    // ── Build scenario record ─────────────────────────────────────────────────
    // FRAT is single-scenario-per-property — no user-facing scenario picker.
    const scenarioRecord = {
      property_id:           propertyId,
      module:                'FRAT',
      scenario_name:         'Base Case',
      scenario_description:  null,
      bedrooms_or_units:     0,          // not applicable for flips
      calculate_per_bedroom: false,
      bedroom_details:       null,
      inputs,
      computed,
      bands,
      created_by:            CONFIG.FOUNDER_USER_ID,
    };

    console.log(`    [SCENARIO] "Base Case" — ROI: ${isFinite(computed.roi) ? (computed.roi * 100).toFixed(2) + '%' : 'N/A'}, ARV target (40%): $${computed.suggestedARV.roi40?.toFixed(0) || 'N/A'}`);

    if (!CONFIG.DRY_RUN) {
      const { error } = await supabase.from('scenarios').insert(scenarioRecord);
      if (error) {
        console.error(`      ERROR inserting scenario: ${error.message}`);
        skipCount++;
        continue;
      }
    }
    scenarioInsertCount++;
  }

  console.log('\n════════════════════════════════');
  console.log(`Properties inserted:   ${propertyInsertCount}`);
  console.log(`Scenarios inserted:    ${scenarioInsertCount}`);
  console.log(`Rows skipped/errored:  ${skipCount}`);
  if (CONFIG.DRY_RUN) {
    console.log('\n[DRY RUN complete — no data was written to Supabase]');
    console.log('Set DRY_RUN=false (or unset) and re-run to execute migration.');
  } else {
    console.log('\nMigration complete. Run migration/05_validate.sql in Supabase SQL editor to verify.');
  }
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
