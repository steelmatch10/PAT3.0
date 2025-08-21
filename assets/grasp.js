/* GRASP page behavior */
document.addEventListener("DOMContentLoaded", () => {
  const els = {
    units: document.getElementById("units"),
    rentPerUnitMonthly: document.getElementById("rentPerUnitMonthly"),
    address: document.getElementById("address"),
    link: document.getElementById("link"),
    propertyValue: document.getElementById("propertyValue"),
    percentDownPct: document.getElementById("percentDownPct"),
    rateAprPct: document.getElementById("rateAprPct"),
    loanLengthYears: document.getElementById("loanLengthYears"),
    psf: document.getElementById("psf"),
    estImprovementCost: document.getElementById("estImprovementCost"),
    taxesMonthly: document.getElementById("taxesMonthly"),
    insuranceMonthly: document.getElementById("insuranceMonthly"),
    hoaMonthly: document.getElementById("hoaMonthly"),
    comments: document.getElementById("comments"),
    addBtn: document.getElementById("addBtn"),
    clearBtn: document.getElementById("clearBtn"),
    viewModeToggle: document.getElementById("viewModeToggle"),
    viewModeLabel: document.getElementById("viewModeLabel"),
    taxesLabel: document.getElementById("taxesLabel"),
    insuranceLabel: document.getElementById("insuranceLabel"),
    hoaLabel: document.getElementById("hoaLabel"),
    kpiBadges: document.getElementById("kpiBadges"),
    supplemental: document.getElementById("supplemental"),
    dscrGuide: document.getElementById("dscrGuide"),
    suggestedRentBody: document.getElementById("suggestedRentBody")
  };

  // Restore view mode
  const viewMode = readViewMode();
  const startAnnual = (viewMode === "annual");
  els.viewModeToggle.checked = startAnnual;
  els.viewModeLabel.textContent = startAnnual ? "Annual view" : "Monthly view";
  setCarryCostLabels(startAnnual ? "annual" : "monthly");

  // Restore form state
  const state = readFormState();
  for(const key in state){
    if(els[key]) els[key].value = state[key];
  }

  // Toggle view mode: convert taxes/insurance/hoa
  els.viewModeToggle.addEventListener("change", () => {
    const fromMode = els.viewModeLabel.textContent.startsWith("Monthly") ? "monthly" : "annual";
    const toMode = (fromMode === "monthly") ? "annual" : "monthly";
    const current = {
      taxesMonthly: els.taxesMonthly.value,
      insuranceMonthly: els.insuranceMonthly.value,
      hoaMonthly: els.hoaMonthly.value
    };
    const converted = convertCarryCosts(current, fromMode, toMode);
    els.taxesMonthly.value = converted.taxesMonthly;
    els.insuranceMonthly.value = converted.insuranceMonthly;
    els.hoaMonthly.value = converted.hoaMonthly;
    els.viewModeLabel.textContent = (toMode === "annual") ? "Annual view" : "Monthly view";
    setCarryCostLabels(toMode);
    saveViewMode(toMode);
    triggerCompute();
  });

  function setCarryCostLabels(mode){
    const sfx = mode==="annual" ? " (Annual)" : " (Monthly)";
    els.taxesLabel.textContent = "Taxes" + sfx;
    els.insuranceLabel.textContent = "Insurance" + sfx;
    els.hoaLabel.textContent = "HOA" + sfx;
  }

  // Input listeners
  ["input","change"].forEach(evt=>{
    Object.values(els).forEach(el=>{
      if(!el || !el.tagName || (el.tagName!=="INPUT" && el.tagName!=="TEXTAREA")) return;
      el.addEventListener(evt, () => {
        persistFormState(collectForm());
        triggerCompute();
      });
    });
  });

  function collectForm(){
    // Normalize carry costs back to monthly for computation, based on view mode
    const mode = els.viewModeLabel.textContent.startsWith("Annual") ? "annual" : "monthly";
    const raw = {
      units: els.units.value,
      rentPerUnitMonthly: els.rentPerUnitMonthly.value,
      address: els.address.value,
      link: els.link.value,
      propertyValue: els.propertyValue.value,
      percentDownPct: els.percentDownPct.value,
      rateAprPct: els.rateAprPct.value,
      loanLengthYears: els.loanLengthYears.value,
      psf: els.psf.value,
      estImprovementCost: els.estImprovementCost.value,
      taxesMonthly: els.taxesMonthly.value,
      insuranceMonthly: els.insuranceMonthly.value,
      hoaMonthly: els.hoaMonthly.value,
      comments: els.comments.value
    };
    const normalized = (mode==="annual") ? convertCarryCosts(raw, "annual", "monthly") : raw;
    return normalized;
  }

  function triggerCompute(){
    const input = collectForm();
    const units = parseInt(input.units||"0",10);
    const rent = toNumber(input.rentPerUnitMonthly);
    const propertyValue = toNumber(input.propertyValue);
    const downPct = toNumber(input.percentDownPct);
    const ratePct = toNumber(input.rateAprPct);

    const kpi = computeAll({
      propertyValue: propertyValue,
      percentDownPct: downPct,
      rateAprPct: ratePct,
      loanLengthYears: input.loanLengthYears,
      taxesMonthly: input.taxesMonthly,
      insuranceMonthly: input.insuranceMonthly,
      hoaMonthly: input.hoaMonthly,
      estImprovementCost: input.estImprovementCost,
      bedroomsOrUnits: units,
      rentPerUnitMonthly: rent
    });

    renderKPIs(kpi);
    renderDSCRGuide(kpi);
    renderSuggestedRent(kpi);
    renderSupplemental(kpi);
  }

  function renderKPIs(k){
    const cap = k.computed.capRate;
    const coc = k.computed.cashOnCash;
    const dscr = k.computed.dscr;
    const bCap = k.bands.capRate;
    const bCoC = k.bands.cashOnCash;
    const bDSCR = k.bands.dscr;

    const capVal = isFinite(cap) ? formatPct(cap) : "N/A";
    const cocVal = isFinite(coc) ? formatPct(coc) : "N/A";
    const dscrVal = isFinite(dscr) ? (dscr.toFixed(2)) : "N/A";

    els.kpiBadges.innerHTML = `
      <div class="${kpiClass(bCoC)}">CoC <span class="value"> ${cocVal}</span></div>
      <div class="${kpiClass(bCap)}">Cap Rate <span class="value"> ${capVal}</span></div>
      <div class="${kpiClass(bDSCR)}">DSCR <span class="value"> ${dscrVal}</span></div>
    `;
  }

  function renderDSCRGuide(k){
    const g = k.computed.dscrGuidance;
    const p15 = isFinite(g.priceForDSCR1_5) ? formatMoney(g.priceForDSCR1_5) : "N/A";
    const p12 = isFinite(g.priceForDSCR1_2) ? formatMoney(g.priceForDSCR1_2) : "N/A";
    els.dscrGuide.innerHTML = `
      <div class="card"><div class="small">DSCR 1.5 Price</div><div style="font-weight:800;font-size:18px">${p15}</div></div>
      <div class="card"><div class="small">DSCR 1.2 Price</div><div style="font-weight:800;font-size:18px">${p12}</div></div>
    `;
  }

  function renderSuggestedRent(k){
    const s = k.computed.suggestedRentPerUnit;
    function cell(v){ return isFinite(v) ? formatMoney(v) : "N/A"; }
    els.suggestedRentBody.innerHTML = `
      <tr><td>CoC 7%</td><td>${cell(s.coc.pct7)}</td></tr>
      <tr><td>CoC 5%</td><td>${cell(s.coc.pct5)}</td></tr>
      <tr><td>CoC 3%</td><td>${cell(s.coc.pct3)}</td></tr>
      <tr><td>Cap 12%</td><td>${cell(s.cap.pct12)}</td></tr>
      <tr><td>Cap 8%</td><td>${cell(s.cap.pct8)}</td></tr>
      <tr><td>Cap 5%</td><td>${cell(s.cap.pct5)}</td></tr>
    `;
  }

  function renderSupplemental(k){
    const c = k.computed;
    const n = k.inputsNormalized;
    const items = [
      ["Down Payment", formatMoney(n.downPayment)],
      ["Closing Costs (5%)", formatMoney(n.closingCosts)],
      ["Loan Amount", formatMoney(n.loanAmount)],
      ["Mortgage (Monthly)", formatMoney(c.mortgageMonthly)],
      ["Ownership Cost (Monthly)", formatMoney(c.ownershipCostMonthly)],
      ["Operating Expenses (Monthly)", formatMoney(c.operatingExpensesMonthly)],
      ["Gross Rent (Monthly)", formatMoney(c.grossRentMonthly)],
      ["NOI (Annual)", formatMoney(c.noiAnnual)],
      ["Annual Cash Flow", formatMoney(c.annualCashFlow)],
      ["Misc (Monthly, hidden in math)", formatMoney(n.miscMonthly)]
    ];
    els.supplemental.innerHTML = items.map(([k,v])=>`<div class="row" style="justify-content:space-between"><div class="small">${k}</div><div>${v}</div></div>`).join("");
  }

  // Add property
  els.addBtn.addEventListener("click", () => {
    const normalized = collectForm();
    const minimalOk = (toNumber(normalized.propertyValue)>0 &&
                       toNumber(normalized.percentDownPct)>=0 &&
                       toNumber(normalized.rateAprPct)>=0 &&
                       parseInt(normalized.units||"0",10)>0 &&
                       toNumber(normalized.rentPerUnitMonthly)>0);
    if(!minimalOk){
      alert("Please provide at least: Property Value, Percent Down, Rate, Units, Rent per Unit.");
      return;
    }
    const computed = computeAll({
      propertyValue: normalized.propertyValue,
      percentDownPct: normalized.percentDownPct,
      rateAprPct: normalized.rateAprPct,
      loanLengthYears: normalized.loanLengthYears,
      taxesMonthly: normalized.taxesMonthly,
      insuranceMonthly: normalized.insuranceMonthly,
      hoaMonthly: normalized.hoaMonthly,
      estImprovementCost: normalized.estImprovementCost,
      bedroomsOrUnits: normalized.units,
      rentPerUnitMonthly: normalized.rentPerUnitMonthly
    });

    const prop = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      module: "GRASP",
      source:{
        address: document.getElementById("address").value || "",
        link: document.getElementById("link").value || "",
        entryMode: "manual"
      },
      inputs:{
        propertyValue: toNumber(normalized.propertyValue),
        percentDownPct: toNumber(normalized.percentDownPct),
        rateAprPct: toNumber(normalized.rateAprPct),
        loanLengthYears: toNumber(normalized.loanLengthYears || 30),
        taxesMonthly: toNumber(normalized.taxesMonthly),
        insuranceMonthly: toNumber(normalized.insuranceMonthly),
        hoaMonthly: toNumber(normalized.hoaMonthly),
        estImprovementCost: toNumber(normalized.estImprovementCost),
        bedroomsOrUnits: parseInt(normalized.units||"0",10),
        rentPerUnitMonthly: toNumber(normalized.rentPerUnitMonthly),
        psf: toNumber(document.getElementById("psf").value || "0") || null,
        comments: document.getElementById("comments").value || "",
        closingCostsRate: 0.05,
        miscRateAnnual: 0.01
      },
      computed:{
        mortgageMonthly: round2(computed.computed.mortgageMonthly),
        grossRentMonthly: round2(computed.computed.grossRentMonthly),
        operatingExpensesMonthly: round2(computed.computed.operatingExpensesMonthly),
        ownershipCostMonthly: round2(computed.computed.ownershipCostMonthly),
        annualCashFlow: round2(computed.computed.annualCashFlow),
        noiAnnual: round2(computed.computed.noiAnnual),
        capRate: computed.computed.capRate,
        cashOnCash: computed.computed.cashOnCash,
        dscr: computed.computed.dscr,
        dscrGuidance:{
          priceForDSCR1_5: computed.computed.dscrGuidance.priceForDSCR1_5,
          priceForDSCR1_2: computed.computed.dscrGuidance.priceForDSCR1_2
        },
        suggestedRentPerUnit: computed.computed.suggestedRentPerUnit
      },
      bands:{
        capRate: computed.bands.capRate.label,
        cashOnCash: computed.bands.cashOnCash.label,
        dscr: computed.bands.dscr.label
      }
    };

    savePropertyToCatalog(prop);
    alert("Property added to catalog.");
  });

  // Clear inputs
  els.clearBtn.addEventListener("click", () => {
    Object.values(els).forEach(el=>{
      if(!el || !el.tagName) return;
      if(el.tagName==="INPUT" || el.tagName==="TEXTAREA"){
        if(el.type==="number" || el.type==="text" || el.type==="url") el.value = "";
      }
    });
    els.loanLengthYears.value = 30;
    persistFormState(collectForm());
    triggerCompute();
  });

  // Initial compute
  triggerCompute();
});