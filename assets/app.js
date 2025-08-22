// ===== Shared Utilities for PAT =====

// --- Storage Helpers ---
function getCatalog() {
  try {
    const raw = localStorage.getItem("pat_catalog");
    return raw ? JSON.parse(raw) : { schemaVersion: "pat-1.0.0", properties: [] };
  } catch {
    return { schemaVersion: "pat-1.0.0", properties: [] };
  }
}
function saveCatalog(obj) {
  localStorage.setItem("pat_catalog", JSON.stringify(obj));
}
function savePropertyToCatalog(prop) {
  const catalog = getCatalog();
  catalog.properties.push(prop);
  saveCatalog(catalog);
}
function updatePropertyInCatalog(id, updater) {
  const catalog = getCatalog();
  const idx = (catalog.properties || []).findIndex(p => p.id === id);
  if (idx >= 0) {
    catalog.properties[idx] = typeof updater === "function"
      ? updater(catalog.properties[idx])
      : { ...catalog.properties[idx], ...updater };
    catalog.properties[idx].updatedAt = new Date().toISOString();
    saveCatalog(catalog);
    return true;
  }
  return false;
}
function persistFormState(obj) {
  localStorage.setItem("grasp_form", JSON.stringify(obj));
}
function readFormState() {
  try { return JSON.parse(localStorage.getItem("grasp_form")) || {}; }
  catch { return {}; }
}
function saveViewMode(mode) { localStorage.setItem("grasp_viewmode", mode); }
function readViewMode() { return localStorage.getItem("grasp_viewmode") || "monthly"; }

// --- Numeric & Format Helpers ---
function toNumber(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function formatMoney(v) { return (!isFinite(v)) ? "N/A" : "$" + round2(v).toLocaleString(); }
function formatPct(v) { return (!isFinite(v)) ? "N/A" : (v * 100).toFixed(2) + "%"; }

// --- Banding logic ---
function bandCoC(v){
  if(!isFinite(v)) return {label:"N/A"};
  if(v > 0.07) return {label:"Great"};
  if(v >= 0.05) return {label:"Good"};
  if(v >= 0.03) return {label:"Okay"};
  if(v >= 0) return {label:"Bad"};
  return {label:"Negative"};
}
function bandCapRate(v){
  if(!isFinite(v)) return {label:"N/A"};
  if(v > 0.12) return {label:"Great"};
  if(v >= 0.08) return {label:"Good"};
  if(v >= 0.05) return {label:"Okay"};
  if(v >= 0) return {label:"Bad"};
  return {label:"Negative"};
}
function bandDSCR(v){
  if(!isFinite(v)) return {label:"N/A"};
  if(v > 1.36) return {label:"Great"};
  if(v >= 1.21) return {label:"Okay"}; // no Good band per your spec
  if(v >= 0) return {label:"Bad"};
  return {label:"N/A"};
}
function kpiClass(b){
  switch(b?.label){
    case "Great": return "kpi great";
    case "Good": return "kpi good";
    case "Okay": return "kpi okay";
    case "Bad":
    case "Negative": return "kpi bad";
    default: return "kpi na";
  }
}
function badgeClass(b){
  switch(b?.label){
    case "Great": return "badge great";
    case "Good": return "badge good";
    case "Okay": return "badge okay";
    case "Bad":
    case "Negative": return "badge bad";
    default: return "badge na";
  }
}

// --- Address Helpers ---
function normalizeWhitespace(s){ return (s||"").replace(/\s+/g," ").trim(); }
function parseAddress(raw){
  const s = normalizeWhitespace(raw);
  if(!s) return { raw:"", line1:"", line2:"", city:"", state:"", zip:"", normalized:"" };
  // Heuristic: split by comma
  const parts = s.split(",").map(p=>p.trim());
  const line1 = parts[0] || "";
  let line2 = "";
  let city = "", state = "", zip = "";
  if(parts.length === 2){
    // "line1, city state zip"
    const rest = parts[1].split(/\s+/);
    city = rest.slice(0, -2).join(" ") || "";
    state = rest.slice(-2, -1)[0] || "";
    zip = rest.slice(-1)[0] || "";
  } else if(parts.length >= 3){
    line2 = parts[1] || "";
    city = parts[2] || "";
    if(parts[3]){
      const stz = parts[3].trim().split(/\s+/);
      state = stz[0] || "";
      zip = stz[1] || "";
    }
  }
  const normalized = (line1 + "|" + line2 + "|" + city + "|" + state + "|" + zip).toLowerCase();
  return { raw:s, line1, line2, city, state, zip, normalized };
}
function findDuplicateByAddress(addressRaw){
  const cat = getCatalog();
  const target = parseAddress(addressRaw);
  if(!target.normalized) return null;
  const hit = (cat.properties||[]).find(p => {
    const pa = parseAddress(p?.source?.address || "");
    return pa.line1.toLowerCase() === target.line1.toLowerCase() &&
           pa.normalized === target.normalized;
  });
  return hit || null;
}

// --- Conversion Helpers (carry costs only) ---
function convertCarryCosts(raw, fromMode, toMode){
  let t = toNumber(raw.taxesMonthly || 0);
  let i = toNumber(raw.insuranceMonthly || 0);
  let h = toNumber(raw.hoaMonthly || 0);
  if(fromMode === "annual"){ t/=12; i/=12; h/=12; }
  if(toMode === "annual"){ t*=12; i*=12; h*=12; }
  return { ...raw, taxesMonthly: round2(t), insuranceMonthly: round2(i), hoaMonthly: round2(h) };
}

// --- Core Computation ---
function computeAll(input){
  const propertyValue = toNumber(input.propertyValue);
  const percentDown = toNumber(input.percentDownPct)/100;
  const rateApr = toNumber(input.rateAprPct)/100;
  const loanYears = toNumber(input.loanLengthYears||30);
  const taxesMonthly = toNumber(input.taxesMonthly);
  const insuranceMonthly = toNumber(input.insuranceMonthly);
  const hoaMonthly = toNumber(input.hoaMonthly);
  const estImprovementCost = toNumber(input.estImprovementCost);
  const units = Math.max(0, parseInt(input.bedroomsOrUnits||0,10));
  const rentPerUnitMonthly = toNumber(input.rentPerUnitMonthly);

  const downPayment = propertyValue * percentDown;
  const closingCosts = propertyValue * 0.05;     // 5%
  const miscMonthly = (propertyValue * 0.01) / 12; // 1% annual

  const loanAmount = Math.max(0, propertyValue - downPayment);
  const r = rateApr/12;
  const n = loanYears*12;

  let mortgageMonthly = 0;
  if(r === 0){
    mortgageMonthly = n>0 ? loanAmount / n : 0;
  }else{
    const denom = (1 - Math.pow(1 + r, -n));
    mortgageMonthly = denom !== 0 ? loanAmount * r / denom : 0;
  }

  const grossRentMonthly = units * rentPerUnitMonthly;
  const operatingExpensesMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + miscMonthly;
  const ownershipCostMonthly = operatingExpensesMonthly + mortgageMonthly;

  const noiAnnual = (grossRentMonthly - operatingExpensesMonthly) * 12;
  const annualCashFlow = (grossRentMonthly - ownershipCostMonthly) * 12;
  const totalInitialInvestment = downPayment + estImprovementCost + closingCosts;

  const capRate = (propertyValue>0) ? (noiAnnual / propertyValue) : NaN;
  const cashOnCash = (totalInitialInvestment>0) ? (annualCashFlow / totalInitialInvestment) : NaN;
  const dscr = (mortgageMonthly>0) ? (noiAnnual / (mortgageMonthly*12)) : NaN;

  function priceForDSCR(target){
    if(target<=0) return NaN;
    const ADS = (0.85 * noiAnnual) / target; // 85% NOI
    const PMT = ADS / 12;
    let loanTarget = 0;
    if(r===0){
      loanTarget = PMT * n;
    }else{
      const denom = (1 - Math.pow(1 + r, -n));
      if(denom === 0) return NaN;
      loanTarget = PMT * denom / r;
    }
    const eq = (1 - percentDown);
    if(eq<=0) return NaN;
    const price = loanTarget / eq;
    return (isFinite(price) && price>0) ? price : NaN;
  }

  function rentPerUnitForCoC(targetCoC){
    if(units<=0) return NaN;
    const numer = targetCoC*totalInitialInvestment + 12*(operatingExpensesMonthly + mortgageMonthly);
    const denom = 12*units;
    return denom>0 ? numer/denom : NaN;
  }
  function rentPerUnitForCap(targetCap){
    if(units<=0) return NaN;
    const numer = targetCap*propertyValue + 12*operatingExpensesMonthly;
    const denom = 12*units;
    return denom>0 ? numer/denom : NaN;
  }

  return {
    inputsNormalized: { downPayment, closingCosts, loanAmount, miscMonthly },
    computed:{
      mortgageMonthly, grossRentMonthly, operatingExpensesMonthly, ownershipCostMonthly,
      annualCashFlow, noiAnnual, capRate, cashOnCash, dscr,
      dscrGuidance:{ priceForDSCR1_5: priceForDSCR(1.5), priceForDSCR1_2: priceForDSCR(1.2) },
      suggestedRentPerUnit:{
        coc:{ pct7: rentPerUnitForCoC(0.07), pct5: rentPerUnitForCoC(0.05), pct3: rentPerUnitForCoC(0.03) },
        cap:{ pct12: rentPerUnitForCap(0.12), pct8: rentPerUnitForCap(0.08), pct5: rentPerUnitForCap(0.05) }
      }
    },
    bands:{
      capRate: bandCapRate(capRate),
      cashOnCash: bandCoC(cashOnCash),
      dscr: bandDSCR(dscr)
    }
  };
}

// --- Simple printable HTML for PDF export (browser print-to-PDF) ---
function openPrintableCatalogue(props){
  const w = window.open("", "_blank");
  if(!w) return;
  const rows = props.map(p=>{
    const addr = parseAddress(p?.source?.address || "");
    const head = addr.line1 || "(No address)";
    const sub = [addr.line2, [addr.city, addr.state, addr.zip].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
    const coc = isFinite(p.computed?.cashOnCash) ? (p.computed.cashOnCash*100).toFixed(2)+"%" : "N/A";
    const cap = isFinite(p.computed?.capRate) ? (p.computed.capRate*100).toFixed(2)+"%" : "N/A";
    const dscr = isFinite(p.computed?.dscr) ? p.computed.dscr.toFixed(2) : "N/A";
    return `<tr>
      <td><div style="font-weight:700">${head}</div><div style="font-size:12px;color:#555">${sub||""}</div></td>
      <td>${formatMoney(p.inputs.propertyValue)}</td>
      <td>${coc}</td>
      <td>${cap}</td>
      <td>${dscr}</td>
    </tr>`;
  }).join("");
  w.document.write(`
    <html><head><title>PAT Catalogue</title>
    <style>
      body{font-family:Arial, sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f1f3f5}
    </style></head><body>
    <h2>PAT Catalogue</h2>
    <table>
      <thead><tr><th>Address</th><th>Value</th><th>CoC</th><th>Cap</th><th>DSCR</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>window.print();</script>
    </body></html>
  `);
  w.document.close();
}