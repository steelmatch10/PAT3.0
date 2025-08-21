/* PAT 3.0 Shared Utilities */
const STORAGE_KEY = "pat_catalog";
const FORM_STATE_KEY = "grasp_form_state";
const VIEW_MODE_KEY = "grasp_view_mode"; // 'monthly' | 'annual' for carry costs view (rent always monthly)

const DEFAULTS = {
  schemaVersion: "grasp-1.0.2",
  closingCostsRate: 0.05,
  miscRateAnnual: 0.01, // 1% of property value per year
  viewMode: "monthly"
};

function getCatalog(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { schemaVersion: DEFAULTS.schemaVersion, properties: [] };
    const parsed = JSON.parse(raw);
    if(!parsed.schemaVersion) parsed.schemaVersion = DEFAULTS.schemaVersion;
    if(!parsed.properties) parsed.properties = [];
    return parsed;
  }catch(e){
    console.warn("Catalog parse error, resetting", e);
    return { schemaVersion: DEFAULTS.schemaVersion, properties: [] };
  }
}
function saveCatalog(catalog){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog, null, 2));
}
function savePropertyToCatalog(prop){
  const catalog = getCatalog();
  catalog.properties.unshift(prop);
  saveCatalog(catalog);
}
function persistFormState(state){
  localStorage.setItem(FORM_STATE_KEY, JSON.stringify(state));
}
function readFormState(){
  try{ return JSON.parse(localStorage.getItem(FORM_STATE_KEY) || "{}"); }
  catch(e){ return {}; }
}
function saveViewMode(mode){
  localStorage.setItem(VIEW_MODE_KEY, mode);
}
function readViewMode(){
  return localStorage.getItem(VIEW_MODE_KEY) || DEFAULTS.viewMode;
}

// Math helpers
function toNumber(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function pctToDecimal(p){ return toNumber(p)/100; }
function round2(x){ return Math.round((x + Number.EPSILON) * 100) / 100; }
function formatPct(x){ if(x===null || x===undefined || isNaN(x)) return "N/A"; return (x*100).toFixed(2) + "%"; }
function formatMoney(x){ if(x===null || x===undefined || isNaN(x)) return "N/A"; return "$" + round2(x).toLocaleString(); }
function bandCapRate(v){
  if(v===null || isNaN(v)) return {label:"N/A", cls:"na"};
  if(v < 0) return {label:"Negative", cls:"bad"};
  if(v > 0.12) return {label:"Great", cls:"great"};
  if(v >= 0.08) return {label:"Good", cls:"good"};
  if(v >= 0.05) return {label:"Okay", cls:"okay"};
  if(v >= 0) return {label:"Bad", cls:"bad"};
  return {label:"N/A", cls:"na"};
}
function bandCoC(v){
  if(v===null || isNaN(v)) return {label:"N/A", cls:"na"};
  if(v < 0) return {label:"Negative", cls:"bad"};
  if(v > 0.07) return {label:"Great", cls:"great"};
  if(v >= 0.05) return {label:"Good", cls:"good"};
  if(v >= 0.03) return {label:"Okay", cls:"okay"};
  if(v >= 0) return {label:"Bad", cls:"bad"};
  return {label:"N/A", cls:"na"};
}
function bandDSCR(v){
  if(v===null || isNaN(v)) return {label:"N/A", cls:"na"};
  if(v > 1.36) return {label:"Great", cls:"great"};
  if(v >= 1.21) return {label:"Okay", cls:"okay"}; // no Good band per your spec
  if(v >= 0) return {label:"Bad", cls:"bad"};
  return {label:"N/A", cls:"na"};
}

// Core computations
function computeAll(input){
  // Normalize inputs
  const propertyValue = toNumber(input.propertyValue);
  const percentDown = pctToDecimal(input.percentDownPct);
  const rateApr = pctToDecimal(input.rateAprPct);
  const loanYears = toNumber(input.loanLengthYears || 30);
  const taxesMonthly = toNumber(input.taxesMonthly);
  const insuranceMonthly = toNumber(input.insuranceMonthly);
  const hoaMonthly = toNumber(input.hoaMonthly);
  const estImprovementCost = toNumber(input.estImprovementCost);
  const units = Math.max(0, parseInt(input.bedroomsOrUnits||0,10));
  const rentPerUnitMonthly = toNumber(input.rentPerUnitMonthly);
  const closingCostsRate = DEFAULTS.closingCostsRate;
  const miscRateAnnual = DEFAULTS.miscRateAnnual;

  const downPayment = propertyValue * percentDown;
  const closingCosts = propertyValue * closingCostsRate;
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
  const miscMonthly = (propertyValue * miscRateAnnual) / 12.0;
  const operatingExpensesMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + miscMonthly;
  const ownershipCostMonthly = operatingExpensesMonthly + mortgageMonthly;

  const noiAnnual = (grossRentMonthly - operatingExpensesMonthly) * 12;
  const annualCashFlow = (grossRentMonthly - operatingExpensesMonthly - mortgageMonthly) * 12;

  const totalInitialInvestment = downPayment + estImprovementCost + closingCosts;

  const capRate = (propertyValue>0) ? (noiAnnual / propertyValue) : NaN;
  const cashOnCash = (totalInitialInvestment>0) ? (annualCashFlow / totalInitialInvestment) : NaN;
  const dscr = (mortgageMonthly>0) ? (noiAnnual / (mortgageMonthly*12)) : NaN;

  // DSCR guidance using 85% NOI
  function priceForDSCR(target){
    if(target<=0) return NaN;
    const ADS = (0.85 * noiAnnual) / target;
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
    if(!isFinite(price) || price<0) return NaN;
    return price;
  }

  const priceDSCR15 = priceForDSCR(1.5);
  const priceDSCR12 = priceForDSCR(1.2);

  // Suggested rent / unit to hit targets
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
    inputsNormalized: { downPayment, closingCosts, loanAmount, r, n, miscMonthly },
    computed:{
      mortgageMonthly, grossRentMonthly, operatingExpensesMonthly, ownershipCostMonthly,
      annualCashFlow, noiAnnual, capRate, cashOnCash, dscr,
      dscrGuidance:{ priceForDSCR1_5: priceDSCR15, priceForDSCR1_2: priceDSCR12 },
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

// Classes for badges
function badgeClass(band){ return `badge ${band.cls}`; }
function kpiClass(band){ return `kpi ${band.cls}`; }

// View mode conversion for carry costs (taxes/insurance/hoa only; rent is monthly-only)
function convertCarryCosts(values, fromMode, toMode){
  const fields = ["taxesMonthly","insuranceMonthly","hoaMonthly"];
  if(fromMode===toMode) return values;
  const factor = (fromMode==="monthly" && toMode==="annual") ? 12 : (fromMode==="annual" && toMode==="monthly") ? (1/12) : 1;
  const updated = {...values};
  fields.forEach(f=>{ updated[f] = round2(toNumber(updated[f]) * factor); });
  return updated;
}