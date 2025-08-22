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
    addOrSaveBtn: document.getElementById("addOrSaveBtn"),
    clearBtn: document.getElementById("clearBtn"),
    viewModeToggle: document.getElementById("viewModeToggle"),
    viewModeLabel: document.getElementById("viewModeLabel"),
    taxesLabel: document.getElementById("taxesLabel"),
    insuranceLabel: document.getElementById("insuranceLabel"),
    hoaLabel: document.getElementById("hoaLabel"),
    kpiBadges: document.getElementById("kpiBadges"),
    supplemental: document.getElementById("supplemental"),
    dscrGuide: document.getElementById("dscrGuide"),
    suggestedRentCoc: document.getElementById("suggestedRentCoc"),
    suggestedRentCap: document.getElementById("suggestedRentCap"),
    moreDetails: document.getElementById("moreDetails")
  };

  // --- Page Mode (Add vs Edit) ---
  const params = new URLSearchParams(location.search);
  let editId = params.get("edit");
  let isEditMode = !!editId;

  // Clear form on entry when NOT editing (per requirement #1)
  if(!isEditMode){
    localStorage.removeItem("grasp_form");
    hardResetForm();
  }

  // Prevent-loss guard
  let isDirty = false;
  let lastSavedSnapshot = null;

  function hardResetForm(){
    [
      els.address,els.link,els.propertyValue,els.percentDownPct,els.rateAprPct,
      els.loanLengthYears,els.psf,els.estImprovementCost,els.taxesMonthly,
      els.insuranceMonthly,els.hoaMonthly,els.units,els.rentPerUnitMonthly,els.comments
    ].forEach(el => { if(!el) return; el.value = (el.id==="loanLengthYears") ? 30 : ""; });
    persistFormState(collectForm());
    isDirty = false;
    lastSavedSnapshot = null;
    els.addOrSaveBtn.textContent = "Add Property to Catalogue";
    delete els.addOrSaveBtn.dataset.dupId;
    triggerCompute();
  }

  // Load edit target
  if(isEditMode){
    const cat = getCatalog();
    const found = (cat.properties||[]).find(p => p.id === editId);
    if(found){
      els.addOrSaveBtn.textContent = "Save Changes";
      els.address.value = found.source?.address || "";
      els.link.value = found.source?.link || "";
      els.propertyValue.value = found.inputs?.propertyValue ?? "";
      els.percentDownPct.value = found.inputs?.percentDownPct ?? "";
      els.rateAprPct.value = found.inputs?.rateAprPct ?? "";
      els.loanLengthYears.value = found.inputs?.loanLengthYears ?? 30;
      els.psf.value = found.inputs?.psf ?? "";
      els.estImprovementCost.value = found.inputs?.estImprovementCost ?? "";
      els.taxesMonthly.value = found.inputs?.taxesMonthly ?? "";
      els.insuranceMonthly.value = found.inputs?.insuranceMonthly ?? "";
      els.hoaMonthly.value = found.inputs?.hoaMonthly ?? "";
      els.units.value = found.inputs?.bedroomsOrUnits ?? "";
      els.rentPerUnitMonthly.value = found.inputs?.rentPerUnitMonthly ?? "";
      els.comments.value = found.inputs?.comments ?? "";
      persistFormState(collectForm());
      lastSavedSnapshot = JSON.stringify(collectForm());
    } else {
      isEditMode = false;
      editId = null;
      hardResetForm();
    }
  }

  // View mode (carry costs): restore preference
  const viewMode = readViewMode();
  const startAnnual = (viewMode === "annual");
  els.viewModeToggle.checked = startAnnual;
  els.viewModeLabel.textContent = startAnnual ? "Annual view" : "Monthly view";
  setCarryCostLabels(startAnnual ? "annual" : "monthly");

  // Toggle view mode
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

  // Show more/less label behavior
  if(els.moreDetails){
    const summary = els.moreDetails.querySelector("summary");
    const syncLabel = () => { summary.textContent = els.moreDetails.open ? "Show less" : "Show more"; };
    els.moreDetails.addEventListener("toggle", syncLabel);
    setTimeout(() => syncLabel(), 0);
  }

  // Mark dirty on input edits
  ["input","change"].forEach(evt=>{
    ["units","rentPerUnitMonthly","address","link","propertyValue","percentDownPct","rateAprPct",
     "loanLengthYears","psf","estImprovementCost","taxesMonthly","insuranceMonthly","hoaMonthly","comments"]
     .forEach(id=>{
       const el = els[id];
       if(!el) return;
       el.addEventListener(evt, () => {
         persistFormState(collectForm());
         isDirty = true;
         checkDuplicateAddressUI();
         triggerCompute();
       });
     });
  });

  // Before-unload guard only when KPIs valid & unsaved
  window.addEventListener("beforeunload", (e)=>{
    if(shouldWarnUnsaved()){
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // Also guard the top-right nav links (soft confirm)
  document.querySelectorAll(".nav a").forEach(a=>{
    a.addEventListener("click", (e)=>{
      if(shouldWarnUnsaved()){
        const ok = confirm("You have unsaved changes with valid KPIs. Leave and lose changes?");
        if(!ok){ e.preventDefault(); }
      }
    });
  });

  function collectForm(){
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
    return (mode==="annual") ? convertCarryCosts(raw, "annual", "monthly") : raw;
  }

  function shouldWarnUnsaved(){
    const snap = JSON.stringify(collectForm());
    const haveUnsaved = (lastSavedSnapshot !== snap);
    const k = getKPIsForWarn();
    const kpisValid = isFinite(k.cap) && isFinite(k.coc) && isFinite(k.dscr);
    return (!isEditMode && haveUnsaved && kpisValid) || (isEditMode && haveUnsaved && kpisValid);
  }
  function getKPIsForWarn(){
    const input = collectForm();
    const k = computeAll({
      propertyValue: +input.propertyValue,
      percentDownPct: +input.percentDownPct,
      rateAprPct: +input.rateAprPct,
      loanLengthYears: +input.loanLengthYears,
      taxesMonthly: +input.taxesMonthly,
      insuranceMonthly: +input.insuranceMonthly,
      hoaMonthly: +input.hoaMonthly,
      estImprovementCost: +input.estImprovementCost,
      bedroomsOrUnits: +input.units,
      rentPerUnitMonthly: +input.rentPerUnitMonthly
    });
    return { cap:k.computed.capRate, coc:k.computed.cashOnCash, dscr:k.computed.dscr };
  }

  // Duplicate detection UI feedback
  function checkDuplicateAddressUI(){
    const dup = findDuplicateByAddress(els.address.value);
    if(dup && !isEditMode){
      els.addOrSaveBtn.textContent = "View/Update Pre-Existing Property in Catalogue";
      els.addOrSaveBtn.dataset.dupId = dup.id;
    } else {
      els.addOrSaveBtn.textContent = isEditMode ? "Save Changes" : "Add Property to Catalogue";
      delete els.addOrSaveBtn.dataset.dupId;
    }
  }

  function triggerCompute(){
    const input = collectForm();
    const kpi = computeAll({
      propertyValue: +input.propertyValue,
      percentDownPct: +input.percentDownPct,
      rateAprPct: +input.rateAprPct,
      loanLengthYears: +input.loanLengthYears,
      taxesMonthly: +input.taxesMonthly,
      insuranceMonthly: +input.insuranceMonthly,
      hoaMonthly: +input.hoaMonthly,
      estImprovementCost: +input.estImprovementCost,
      bedroomsOrUnits: +input.units,
      rentPerUnitMonthly: +input.rentPerUnitMonthly
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

    // Tooltips (hover math)
    const tipCap  = "Cap = NOI / Property Value (NOI = (Gross − OpEx) × 12)";
    const tipCoC  = "CoC = Annual Cash Flow / Total Initial Investment";
    const tipDSCR = "DSCR = NOI / Annual Debt Service (Mortgage × 12)";

    els.kpiBadges.innerHTML = `
      <div class="${kpiClass(bCoC)}" title="${tipCoC}">CoC <span class="value"> ${cocVal}</span></div>
      <div class="${kpiClass(bCap)}" title="${tipCap}">Cap Rate <span class="value"> ${capVal}</span></div>
      <div class="${kpiClass(bDSCR)}" title="${tipDSCR}">DSCR <span class="value"> ${dscrVal}</span></div>
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
    const cell = (v)=> isFinite(v) ? formatMoney(v) : "N/A";

    els.suggestedRentCoc.innerHTML = `
      <tr><td>CoC 7%</td><td>${cell(s.coc.pct7)}</td></tr>
      <tr><td>CoC 5%</td><td>${cell(s.coc.pct5)}</td></tr>
      <tr><td>CoC 3%</td><td>${cell(s.coc.pct3)}</td></tr>
    `;
    els.suggestedRentCap.innerHTML = `
      <tr><td>Cap 12%</td><td>${cell(s.cap.pct12)}</td></tr>
      <tr><td>Cap 8%</td><td>${cell(s.cap.pct8)}</td></tr>
      <tr><td>Cap 5%</td><td>${cell(s.cap.pct5)}</td></tr>
    `;
  }

  function renderSupplemental(k){
    const c = k.computed;
    const n = k.inputsNormalized;

    // New: Total Initial Investment
    const totalInitial = n.downPayment + n.closingCosts + (Number(els.estImprovementCost.value)||0);

    const rows = [
      { label:"Down Payment", val: formatMoney(n.downPayment), tip:"Down = Property Value × Percent Down" },
      { label:"Closing Costs (5%)", val: formatMoney(n.closingCosts), tip:"Closing = Property Value × 5%" },
      { label:"Estimated Improvement Cost", val: formatMoney(Number(els.estImprovementCost.value)||0), tip:"As entered" },
      { label:"Total Initial Investment", val: formatMoney(totalInitial), tip:"Down + Closing + Improvements" },
      { label:"Loan Amount", val: formatMoney(n.loanAmount), tip:"Loan = Property Value − Down Payment" },
      { label:"Mortgage (Monthly)", val: formatMoney(c.mortgageMonthly), tip:"PMT = r·L / (1 − (1+r)^−n)" },
      { label:"Ownership Cost (Monthly)", val: formatMoney(c.ownershipCostMonthly), tip:"Ownership = OpEx + Mortgage" },
      { label:"Operating Expenses (Monthly)", val: formatMoney(c.operatingExpensesMonthly), tip:"OpEx = Taxes + Insurance + HOA + Misc(1%/yr ÷ 12)" },
      { label:"Gross Rent (Monthly)", val: formatMoney(c.grossRentMonthly), tip:"Gross = Units × Rent/Unit" },
      { label:"NOI (Annual)", val: formatMoney(c.noiAnnual), tip:"NOI = (Gross − OpEx) × 12" },
      { label:"Annual Cash Flow", val: formatMoney(c.annualCashFlow), tip:"CF = (Gross − OpEx − Mortgage) × 12" },
      { label:"Misc (Monthly)", val: formatMoney(n.miscMonthly), tip:"Misc = Property Value × 1% ÷ 12" }
    ];
    els.supplemental.innerHTML = rows.map(r =>
      `<div class="row" style="justify-content:space-between" title="${r.tip}">
         <div class="small">${r.label}</div><div>${r.val}</div>
       </div>`
    ).join("");
  }

  // Add / Save with duplicate protection
  els.addOrSaveBtn.addEventListener("click", () => {
    if(!isEditMode && els.addOrSaveBtn.dataset.dupId){
      const id = els.addOrSaveBtn.dataset.dupId;
      location.href = `GRASP.html?edit=${id}`;
      return;
    }

    const normalized = collectForm();
    const minimalOk = (+normalized.propertyValue>0 && +normalized.percentDownPct>=0 &&
                       +normalized.rateAprPct>=0 && +normalized.units>0 && +normalized.rentPerUnitMonthly>0);
    if(!minimalOk){
      alert("Please provide at least: Property Value, Percent Down, Rate, Units, Rent per Unit.");
      return;
    }

    if(!isEditMode){
      const dup = findDuplicateByAddress(els.address.value);
      if(dup){
        alert("Property already in catalogue. Redirecting to view/update.");
        location.href = `GRASP.html?edit=${dup.id}`;
        return;
      }
    }

    const computed = computeAll({
      propertyValue: +normalized.propertyValue,
      percentDownPct: +normalized.percentDownPct,
      rateAprPct: +normalized.rateAprPct,
      loanLengthYears: +normalized.loanLengthYears,
      taxesMonthly: +normalized.taxesMonthly,
      insuranceMonthly: +normalized.insuranceMonthly,
      hoaMonthly: +normalized.hoaMonthly,
      estImprovementCost: +normalized.estImprovementCost,
      bedroomsOrUnits: +normalized.units,
      rentPerUnitMonthly: +normalized.rentPerUnitMonthly
    });

    const propCore = {
      module: "GRASP",
      source:{ address: els.address.value || "", link: els.link.value || "", entryMode: "manual" },
      inputs:{
        propertyValue: +normalized.propertyValue,
        percentDownPct: +normalized.percentDownPct,
        rateAprPct: +normalized.rateAprPct,
        loanLengthYears: +(normalized.loanLengthYears || 30),
        taxesMonthly: +normalized.taxesMonthly,
        insuranceMonthly: +normalized.insuranceMonthly,
        hoaMonthly: +normalized.hoaMonthly,
        estImprovementCost: +normalized.estImprovementCost,
        bedroomsOrUnits: +normalized.units,
        rentPerUnitMonthly: +normalized.rentPerUnitMonthly,
        psf: +(els.psf.value || 0) || null,
        comments: els.comments.value || "",
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
        dscrGuidance:{ priceForDSCR1_5: computed.computed.dscrGuidance.priceForDSCR1_5, priceForDSCR1_2: computed.computed.dscrGuidance.priceForDSCR1_2 },
        suggestedRentPerUnit: computed.computed.suggestedRentPerUnit
      },
      bands:{ capRate: computed.bands.capRate.label, cashOnCash: computed.bands.cashOnCash.label, dscr: computed.bands.dscr.label }
    };

    if(isEditMode){
      updatePropertyInCatalog(editId, (prev)=>({ ...prev, ...propCore }));
      alert("Changes saved.");
      lastSavedSnapshot = JSON.stringify(collectForm());
      isDirty = false;
    } else {
      const newId = (crypto.randomUUID ? crypto.randomUUID() : (String(Date.now())+Math.random().toString(16).slice(2)));
      const prop = { id:newId, createdAt:new Date().toISOString(), pinned:false, ...propCore };
      savePropertyToCatalog(prop);
      alert("Property added to catalogue. Switching to edit mode for this entry.");
      location.href = `GRASP.html?edit=${newId}`;
      return;
    }
    checkDuplicateAddressUI();
  });

  // Clear inputs
  els.clearBtn.addEventListener("click", () => { hardResetForm(); });

  // Initial compute
  checkDuplicateAddressUI();
  triggerCompute();

  // Back behavior (in GRASP.html)
  const backBtn = document.getElementById('backBtn');
  if(backBtn){ backBtn.addEventListener('click',(e)=>{ e.preventDefault(); history.back(); }); }
});