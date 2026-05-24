#!/usr/bin/env node
/**
 * PAT 3.0 — GRASP CSV → Supabase Migration Script
 *
 * Prerequisites:
 *   npm install @supabase/supabase-js csv-parse
 *
 * Usage:
 *   node migration/02_migrate.js
 *
 * Required env vars (or set directly below in CONFIG):
 *   SUPABASE_URL      — from Supabase dashboard > Settings > API
 *   SUPABASE_SERVICE_KEY  — use the service_role key (bypasses RLS for migration)
 *   FOUNDER_USER_ID   — UUID of dmalde1998@gmail.com from Supabase Auth
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

// ── CONFIG ─────────────────────────────────────────────────────────────────────
// Fill these in before running, or set as env vars.
const CONFIG = {
  SUPABASE_URL:         process.env.SUPABASE_URL         || 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_SERVICE_ROLE || 'YOUR_SERVICE_ROLE_KEY',
  FOUNDER_USER_ID:      process.env.FOUNDER_USER_ID      || 'YOUR_FOUNDER_UUID',  // dmalde1998@gmail.com
  CSV_PATH: path.join(__dirname, 'Property Analysis Tools (PAT) - (Gauging Rental Asset Strength & Potential) GRASP.csv'),
  DRY_RUN: process.env.DRY_RUN === 'true',  // set DRY_RUN=true to preview without writing
};

// ── CONSTANTS (mirrors app.js CONSTANTS) ───────────────────────────────────────
const CONSTANTS = {
  CLOSING_COSTS:    15000,
  MISC_RATE_ANNUAL: 0.01,
  COC_BANDS:        [0.07, 0.05, 0.03],
  CAP_RATE_BANDS:   [0.12, 0.08, 0.05],
  DSCR_BANDS:       [1.36, 1.21],
  DSCR_TARGETS:     [1.5, 1.2],
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

function bandCoC(v) {
  if (!isFinite(v)) return 'N/A';
  if (v < 0) return 'Negative';
  if (v > CONSTANTS.COC_BANDS[0]) return 'Great';
  if (v >= CONSTANTS.COC_BANDS[1]) return 'Good';
  if (v >= CONSTANTS.COC_BANDS[2]) return 'Okay';
  return 'Bad';
}
function bandCapRate(v) {
  if (!isFinite(v)) return 'N/A';
  if (v < 0) return 'Negative';
  if (v > CONSTANTS.CAP_RATE_BANDS[0]) return 'Great';
  if (v >= CONSTANTS.CAP_RATE_BANDS[1]) return 'Good';
  if (v >= CONSTANTS.CAP_RATE_BANDS[2]) return 'Okay';
  return 'Bad';
}
function bandDSCR(v) {
  if (!isFinite(v)) return 'N/A';
  if (v > CONSTANTS.DSCR_BANDS[0]) return 'Great';
  if (v >= CONSTANTS.DSCR_BANDS[1]) return 'Okay';
  return 'Bad';
}

/**
 * Core computation — mirrors app.js computeAll() exactly.
 * taxesMonthly must already be in monthly form.
 */
function computeAll(input) {
  const propertyValue     = toNum(input.propertyValue);
  const percentDown       = toNum(input.percentDownPct) / 100;
  const rateApr           = toNum(input.rateAprPct) / 100;
  const loanYears         = toNum(input.loanLengthYears || 30);
  const taxesMonthly      = toNum(input.taxesMonthly);
  const insuranceMonthly  = toNum(input.insuranceMonthly);
  const hoaMonthly        = toNum(input.hoaMonthly);
  const estImprovementCost = toNum(input.estImprovementCost);
  const units             = Math.max(0, parseInt(input.bedroomsOrUnits || 0, 10));
  const rentPerUnitMonthly = toNum(input.rentPerUnitMonthly);

  const downPayment  = propertyValue * percentDown;
  const closingCosts = CONSTANTS.CLOSING_COSTS;
  const miscMonthly  = (propertyValue * CONSTANTS.MISC_RATE_ANNUAL) / 12;
  const loanAmount   = Math.max(0, propertyValue - downPayment);
  const r = rateApr / 12;
  const n = loanYears * 12;

  let mortgageMonthly = 0;
  if (r === 0) {
    mortgageMonthly = n > 0 ? loanAmount / n : 0;
  } else {
    const denom = (1 - Math.pow(1 + r, -n));
    mortgageMonthly = denom !== 0 ? loanAmount * r / denom : 0;
  }

  const grossRentMonthly        = units * rentPerUnitMonthly;
  const operatingExpensesMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + miscMonthly;
  const ownershipCostMonthly    = operatingExpensesMonthly + mortgageMonthly;
  // 10% vacancy factor applied to gross rent (mirrors PAT 2.0 workbook)
  const effectiveRentMonthly    = grossRentMonthly * 0.90;
  const noiAnnual               = (effectiveRentMonthly - operatingExpensesMonthly) * 12;
  const annualCashFlow          = (effectiveRentMonthly - ownershipCostMonthly) * 12;
  const totalInitialInvestment  = downPayment + estImprovementCost + closingCosts;

  const capRate    = propertyValue > 0 ? noiAnnual / propertyValue : NaN;
  const cashOnCash = totalInitialInvestment > 0 ? annualCashFlow / totalInitialInvestment : NaN;
  // DSCR uses 80% of NOI — conservative lending standard (PAT 2.0: NOI_80% column)
  const dscr       = mortgageMonthly > 0 ? (noiAnnual * 0.80) / (mortgageMonthly * 12) : NaN;

  function priceForDSCR(target) {
    if (target <= 0) return NaN;
    const ADS = (0.85 * noiAnnual) / target;
    const PMT = ADS / 12;
    let loanTarget = 0;
    if (r === 0) {
      loanTarget = PMT * n;
    } else {
      const denom = (1 - Math.pow(1 + r, -n));
      if (denom === 0) return NaN;
      loanTarget = PMT * denom / r;
    }
    const eq = (1 - percentDown);
    if (eq <= 0) return NaN;
    const price = loanTarget / eq;
    return isFinite(price) && price > 0 ? price : NaN;
  }

  function rentForCoC(targetCoC) {
    if (units <= 0) return NaN;
    const numer = targetCoC * totalInitialInvestment + 12 * (operatingExpensesMonthly + mortgageMonthly);
    const denom = 12 * units;
    return denom > 0 ? numer / denom : NaN;
  }
  function rentForCap(targetCap) {
    if (units <= 0) return NaN;
    const numer = targetCap * propertyValue + 12 * operatingExpensesMonthly;
    const denom = 12 * units;
    return denom > 0 ? numer / denom : NaN;
  }

  const computed = {
    mortgageMonthly, grossRentMonthly, operatingExpensesMonthly, ownershipCostMonthly,
    annualCashFlow, noiAnnual, capRate, cashOnCash, dscr,
    dscrGuidance: {
      priceForDSCR1_5: priceForDSCR(CONSTANTS.DSCR_TARGETS[0]),
      priceForDSCR1_2: priceForDSCR(CONSTANTS.DSCR_TARGETS[1]),
    },
    // Renamed from suggestedRentPerUnit → suggestedGrossRent (v2 schema)
    suggestedGrossRent: {
      coc: {
        pct7: rentForCoC(CONSTANTS.COC_BANDS[0]),
        pct5: rentForCoC(CONSTANTS.COC_BANDS[1]),
        pct3: rentForCoC(CONSTANTS.COC_BANDS[2]),
      },
      cap: {
        pct12: rentForCap(CONSTANTS.CAP_RATE_BANDS[0]),
        pct8:  rentForCap(CONSTANTS.CAP_RATE_BANDS[1]),
        pct5:  rentForCap(CONSTANTS.CAP_RATE_BANDS[2]),
      },
    },
  };

  const bands = {
    capRate:   bandCapRate(capRate),
    cashOnCash: bandCoC(cashOnCash),
    dscr:      bandDSCR(dscr),
  };

  return { computed, bands };
}

/**
 * Parse scenario name from Comments field.
 * Full comments text always goes into scenario_description.
 */
function parseScenarioName(comments, propertyValue, indexWithinProperty) {
  const c = (comments || '').trim();
  if (/best case/i.test(c)) return 'Best Case Scenario';
  if (/worst case/i.test(c)) return 'Worst Case Scenario';
  if (/optimized/i.test(c)) return 'Optimized Scenario';
  if (/base/i.test(c)) return 'Base Case Scenario';
  if (c.length > 0) return c.substring(0, 100);
  return `Scenario #${indexWithinProperty + 1}`;
}

/**
 * Ensure scenario names are unique within a property.
 * Appends " (2)", " (3)", etc. on collision.
 */
function dedupeScenarioName(name, usedNames) {
  if (!usedNames.has(name)) return name;
  let i = 2;
  while (usedNames.has(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('PAT 3.0 GRASP Migration');
  console.log('========================');
  if (CONFIG.DRY_RUN) console.log('[DRY RUN — no writes will occur]\n');

  // Validate config
  if (!CONFIG.SUPABASE_URL.includes('supabase.co') && !CONFIG.DRY_RUN) {
    console.error('ERROR: Set SUPABASE_URL env var or fill in CONFIG above.');
    process.exit(1);
  }
  if (CONFIG.FOUNDER_USER_ID.startsWith('YOUR_') && !CONFIG.DRY_RUN) {
    console.error('ERROR: Set FOUNDER_USER_ID env var. Get it from Supabase Auth > Users.');
    process.exit(1);
  }

  // Init Supabase (service_role key to bypass RLS during migration)
  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

  // Read CSV
  const csvText = fs.readFileSync(CONFIG.CSV_PATH, 'utf8');
  const rows = parse(csvText, {
    skip_empty_lines: true,
    relax_column_count: true,
    from_line: 2,  // skip row 1 (metadata); row 2 is the header
  });

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).filter(r => r[0] && r[0].trim() !== '');

  console.log(`CSV: ${dataRows.length} data rows found\n`);

  // Column index lookup
  const col = (name) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`Column not found: "${name}"`);
    return i;
  };

  // Column indices
  const CI = {
    address:       col('Property Location (w/ Link)'),
    propertyValue: col('Property Value / Negotiated Value'),
    comments:      col('Comments'),
    percentDown:   col('Percent Down'),
    loanLength:    col('Loan Length'),
    rate:          col('Rate'),
    taxesMonthly:  col('Taxes Monthly'),
    insurance:     col('Insurance'),
    hoa:           col('HOA'),
    closingCosts:  col('Property Closing Costs (15k high est)'),
    estImprCost:   col('Est. Impr. Cost'),
    annualMisc:    col('Annual Misc. Cost'),
    bedrooms:      col('Bedrooms/Unit'),
    avgRentPerUnit: col('Realistic Rent Avg Per Bedroom/Unit'),
  };

  // Group rows by property address for scenario indexing
  const propertySeen = new Map(); // address → count of scenarios seen

  const propertyMap = new Map();  // address → {id, usedNames}
  const scenarioInserts = [];

  let propertyInsertCount = 0;
  let scenarioInsertCount = 0;
  let skipCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    // Normalize address: expand common abbreviations so duplicates merge
    const rawAddress = (row[CI.address] || '').trim()
      .replace(/\bSt\b\.?$/i, 'Street')
      .replace(/\bAve\b\.?$/i, 'Avenue')
      .replace(/\bDr\b\.?$/i, 'Drive')
      .replace(/\bRd\b\.?$/i, 'Road')
      .replace(/\bBlvd\b\.?$/i, 'Boulevard')
      .trim();

    if (!rawAddress) {
      console.log(`  Row ${i + 2}: Empty address — skipping`);
      skipCount++;
      continue;
    }

    // ── Parse inputs ────────────────────────────────────────────────────────
    const propertyValue    = parseCurrency(row[CI.propertyValue]);
    const percentDownPct   = parsePct(row[CI.percentDown]);
    const rateAprPct       = parsePct(row[CI.rate]);
    const loanLengthYears  = toNum(row[CI.loanLength]) || 30;
    const taxesMonthlyRaw  = parseCurrency(row[CI.taxesMonthly]);
    const taxesAnnual      = taxesMonthlyRaw * 12;
    const insuranceMonthly = parseCurrency(row[CI.insurance]);
    const hoaMonthly       = parseCurrency(row[CI.hoa]);
    const closingCosts     = parseCurrency(row[CI.closingCosts]) || CONSTANTS.CLOSING_COSTS;
    const estImprovementCost = parseCurrency(row[CI.estImprCost]);
    const annualMiscCost   = parseCurrency(row[CI.annualMisc]);
    const miscRateAnnual   = propertyValue > 0 ? annualMiscCost / propertyValue : CONSTANTS.MISC_RATE_ANNUAL;
    const bedroomsOrUnits  = parseInt(row[CI.bedrooms] || '0', 10) || 0;
    const avgRentPerUnit   = parseCurrency(row[CI.avgRentPerUnit]);
    const comments         = (row[CI.comments] || '').trim();

    // ── Inputs JSONB ────────────────────────────────────────────────────────
    const inputs = {
      propertyValue,
      percentDownPct,
      rateAprPct,
      loanLengthYears,
      taxesAnnual,            // stored annually; frontend divides by 12 for computeAll
      insuranceMonthly,
      hoaMonthly,
      closingCosts,
      estImprovementCost,
      miscRateAnnual,
    };

    // ── Run computeAll (with taxesMonthly = taxesAnnual / 12) ───────────────
    const { computed, bands } = computeAll({
      ...inputs,
      taxesMonthly: taxesAnnual / 12,  // computeAll expects monthly
      bedroomsOrUnits,
      rentPerUnitMonthly: avgRentPerUnit,
    });

    // ── Scenario metadata ────────────────────────────────────────────────────
    const scenarioIndexForProperty = propertySeen.get(rawAddress) ?? 0;
    propertySeen.set(rawAddress, scenarioIndexForProperty + 1);

    const rawScenarioName = parseScenarioName(comments, propertyValue, scenarioIndexForProperty);
    const usedNamesForProperty = propertyMap.get(rawAddress)?.usedNames ?? new Set();
    const scenarioName = dedupeScenarioName(rawScenarioName, usedNamesForProperty);
    usedNamesForProperty.add(scenarioName);

    // ── Upsert property ──────────────────────────────────────────────────────
    let propertyId;
    if (propertyMap.has(rawAddress)) {
      propertyId = propertyMap.get(rawAddress).id;
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
      propertyMap.set(rawAddress, { id: propertyId, usedNames: usedNamesForProperty });
      propertyInsertCount++;
    }

    // ── Build scenario record ────────────────────────────────────────────────
    const scenarioRecord = {
      property_id:          propertyId,
      module:               'GRASP',
      scenario_name:        scenarioName,
      scenario_description: comments || null,
      bedrooms_or_units:    bedroomsOrUnits,
      calculate_per_bedroom: false,
      bedroom_details:      null,
      inputs,
      computed,
      bands,
      created_by:           CONFIG.FOUNDER_USER_ID,
    };

    console.log(`    [SCENARIO] "${scenarioName}" (${bedroomsOrUnits} beds, $${propertyValue.toLocaleString()})`);

    if (!CONFIG.DRY_RUN) {
      const { error } = await supabase.from('scenarios').insert(scenarioRecord);
      if (error) {
        console.error(`      ERROR inserting scenario: ${error.message}`);
        skipCount++;
        continue;
      }
    } else {
      scenarioInserts.push(scenarioRecord);
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
