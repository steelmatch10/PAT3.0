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
function persistFormState(obj) {
  localStorage.setItem("grasp_form", JSON.stringify(obj));
}
function readFormState() {
  try {
    return JSON.parse(localStorage.getItem("grasp_form")) || {};
  } catch {
    return {};
  }
}
function saveViewMode(mode) {
  localStorage.setItem("grasp_viewmode", mode);
}
function readViewMode() {
  return localStorage.getItem("grasp_viewmode") || "monthly";
}

// --- Numeric Helpers ---
function toNumber(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function formatMoney(v) {
  if (!isFinite(v)) return "N/A";
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatPct(v) {
  if (!isFinite(v)) return "N/A";
  return (v * 100).toFixed(2) + "%";
}

// --- Banding logic ---
function bandCoC(v) {
  if (!isFinite(v)) return { label: "N/A" };
  if (v > 0.07) return { label: "Great" };
  if (v >= 0.05) return { label: "Good" };
  if (v >= 0.03) return { label: "Okay" };
  if (v >= 0) return { label: "Bad" };
  return { label: "Negative" };
}
function bandCapRate(v) {
  if (!isFinite(v)) return { label: "N/A" };
  if (v > 0.12) return { label: "Great" };
  if (v >= 0.08) return { label: "Good" };
  if (v >= 0.05) return { label: "Okay" };
  if (v >= 0) return { label: "Bad" };
  return { label: "Negative" };
}
function bandDSCR(v) {
  if (!isFinite(v)) return { label: "N/A" };
  if (v > 1.36) return { label: "Great" };
  if (v >= 1.21) return { label: "Okay" };
  return { label: "Bad" };
}
function kpiClass(b) {
  switch (b?.label) {
    case "Great": return "kpi great";
    case "Good": return "kpi good";
    case "Okay": return "kpi okay";
    case "Bad": return "kpi bad";
    case "Negative": return "kpi bad";
    default: return "kpi na";
  }
}
function badgeClass(b) {
  switch (b?.label) {
    case "Great": return "badge great";
    case "Good": return "badge good";
    case "Okay": return "badge okay";
    case "Bad": return "badge bad";
    case "Negative": return "badge bad";
    default: return "badge na";
  }
}

// --- Conversion Helpers ---
function convertCarryCosts(raw, fromMode, toMode) {
  let t = toNumber(raw.taxesMonthly || 0);
  let i = toNumber(raw.insuranceMonthly || 0);
  let h = toNumber(raw.hoaMonthly || 0);
  if (fromMode === "annual") { t = t/12; i = i/12; h = h/12; }
  if (toMode === "annual") { t = t*12; i = i*12; h = h*12; }
  return {
    ...raw,
    taxesMonthly: round2(t),
    insuranceMonthly: round2(i),
    hoaMonthly: round2(h)
  };
}

// --- Core Computation ---
function computeAll(input) {
  const propertyValue = toNumber(input.propertyValue);
  const downPct = toNumber(input.percentDownPct)/100;
  const rateApr = toNumber(input.rateAprPct)/100;
  const loanYears = toNumber(input.loanLengthYears||30);
  const taxes = toNumber(input.taxesMonthly);
  const insurance = toNumber(input.insuranceMonthly);
  const hoa = toNumber(input.hoaMonthly);
  const estImprovement = toNumber(input.estImprovementCost);
  const units = parseInt(input.bedroomsOrUnits||0,10);
  const rentPerUnit = toNumber(input.rentPerUnitMonthly);

  const downPayment = propertyValue * downPct;
  const closingCosts = propertyValue * 0.05;
  const miscAnnual = propertyValue * 0.01;
  const miscMonthly = miscAnnual/12;

  const loanAmount = propertyValue - downPayment;
  const r = rateApr/12;
  const n = loanYears*12;
  const mortgageMonthly = (r===0) ? (loanAmount/n) :
    (loanAmount * r)/(1 - Math.pow(1+r,-n));

  const grossRentMonthly = units * rentPerUnit;
  const operatingExpensesMonthly = taxes + insurance + hoa + miscMonthly;
  const ownershipCostMonthly = operatingExpensesMonthly + mortgageMonthly;

  const noiAnnual = (grossRentMonthly - operatingExpensesMonthly) * 12;
  const annualCashFlow = (grossRentMonthly - ownershipCostMonthly) * 12;
  const totalInitialInvestment = downPayment + estImprovement + closingCosts;

  const capRate = (propertyValue>0)? (noiAnnual/propertyValue) : NaN;
  const cashOnCash = (totalInitialInvestment>0)? (annualCashFlow/totalInitialInvestment) : NaN;
  const dscr = (mortgageMonthly>0)? (noiAnnual/(mortgageMonthly*12)) : NaN;

  // DSCR target price (85% NOI)
  function priceForDSCR(target){
    if(!isFinite(noiAnnual)||!isFinite(r)||r<=0) return NaN;
    const ADS = (0.85*noiAnnual)/target;
    const PMT = ADS/12;
    const Loan = PMT*(1 - Math.pow(1+r,-n))/r;
    return Loan/(1-downPct);
  }

  // Suggested rent formulas
  function rentForCoC(target){
    if(units<=0) return NaN;
    const need = (target*totalInitialInvestment + 12*(operatingExpensesMonthly+mortgageMonthly))/(12*units);
    return need;
  }
  function rentForCap(target){
    if(units<=0) return NaN;
    const need = (target*propertyValue + 12*operatingExpensesMonthly)/(12*units);
    return need;
  }

  return {
    inputsNormalized:{
      downPayment, closingCosts, loanAmount, miscMonthly
    },
    computed:{
      mortgageMonthly,
      grossRentMonthly,
      operatingExpensesMonthly,
      ownershipCostMonthly,
      annualCashFlow,
      noiAnnual,
      capRate,
      cashOnCash,
      dscr,
      dscrGuidance:{
        priceForDSCR1_5: priceForDSCR(1.5),
        priceForDSCR1_2: priceForDSCR(1.2)
      },
      suggestedRentPerUnit:{
        coc:{ pct7: rentForCoC(0.07), pct5: rentForCoC(0.05), pct3: rentForCoC(0.03) },
        cap:{ pct12: rentForCap(0.12), pct8: rentForCap(0.08), pct5: rentForCap(0.05) }
      }
    },
    bands:{
      capRate: bandCapRate(capRate),
      cashOnCash: bandCoC(cashOnCash),
      dscr: bandDSCR(dscr)
    }
  };
}