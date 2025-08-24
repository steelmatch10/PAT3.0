/* FRAT page behavior — fixed Monthly/Annual toggle */
document.addEventListener("DOMContentLoaded", () => {
  const els = {
    address: document.getElementById("address"),
    link: document.getElementById("link"),
    propertyValue: document.getElementById("propertyValue"),
    percentDownPct: document.getElementById("percentDownPct"),
    rateAprPct: document.getElementById("rateAprPct"),
    loanLengthYears: document.getElementById("loanLengthYears"),
    estFixingCost: document.getElementById("estFixingCost"),
    taxesMonthly: document.getElementById("taxesMonthly"),
    insuranceMonthly: document.getElementById("insuranceMonthly"),
    hoaMonthly: document.getElementById("hoaMonthly"),
    monthsHold: document.getElementById("monthsHold"),
    desiredARV: document.getElementById("desiredARV"),
    interestOnlyToggle: document.getElementById("interestOnlyToggle"),
    comments: document.getElementById("comments"),

    addOrSaveBtn: document.getElementById("addOrSaveBtn"),
    clearBtn: document.getElementById("clearBtn"),

    viewModeToggle: document.getElementById("viewModeToggle"),
    viewModeLabel: document.getElementById("viewModeLabel"),
    taxesLabel: document.getElementById("taxesLabel"),
    insuranceLabel: document.getElementById("insuranceLabel"),
    hoaLabel: document.getElementById("hoaLabel"),

    kpiBadges: document.getElementById("kpiBadges"),
    netIncomeBox: document.getElementById("netIncomeBox"),
    suggestedARV: document.getElementById("suggestedARV"),
    supplemental: document.getElementById("supplemental"),
    moreDetails: document.getElementById("moreDetails"),
  };

  const params = new URLSearchParams(location.search);
  let editId = params.get("edit");
  let isEditMode = !!editId;
  let lastSavedSnapshot = null;

  initPlaceholders();

  if (!isEditMode) {
    hardResetForm();
  }

  // Load edit if present
  if (isEditMode) {
    const cat = getCatalog();
    const found = (cat.properties || []).find(p => p.id === editId);
    if (found && found.module === "FRAT") {
      els.addOrSaveBtn.textContent = "Save Changes";
      const i = found.inputs || {};
      els.address.value = found.source?.address || "";
      els.link.value = found.source?.link || "";
      els.propertyValue.value = i.propertyValue ?? "";
      els.percentDownPct.value = i.percentDownPct ?? "";
      els.rateAprPct.value = i.rateAprPct ?? "";
      els.loanLengthYears.value = i.loanLengthYears ?? 30;
      els.estFixingCost.value = i.estFixingCost ?? "";
      els.taxesMonthly.value = i.taxesMonthly ?? "";
      els.insuranceMonthly.value = i.insuranceMonthly ?? "";
      els.hoaMonthly.value = i.hoaMonthly ?? "";
      els.monthsHold.value = i.monthsHold ?? "";
      els.desiredARV.value = i.desiredARV ?? "";
      els.interestOnlyToggle.checked = !!i.interestOnly;

      // Always store/display carry costs in monthly; set toggle state accordingly
      els.viewModeToggle.checked = false;
      els.viewModeToggle.dataset.mode = "monthly";
      els.viewModeLabel.textContent = "Monthly view";
      setCarryCostLabels("monthly");

      lastSavedSnapshot = JSON.stringify(collectForm());
      triggerCompute();
    } else {
      isEditMode = false;
      editId = null;
      hardResetForm();
    }
  }

  // ===== View mode (Monthly/Annual) — robust handler =====
  els.viewModeToggle.addEventListener("change", () => {
    const currentMode = els.viewModeToggle.dataset.mode || "monthly";
    const toMode = els.viewModeToggle.checked ? "annual" : "monthly";
    if (currentMode === toMode) return;

    const current = {
      taxesMonthly: els.taxesMonthly.value,
      insuranceMonthly: els.insuranceMonthly.value,
      hoaMonthly: els.hoaMonthly.value
    };
    // convertCarryCosts is provided by app.js
    const converted = convertCarryCosts(current, currentMode, toMode);

    els.taxesMonthly.value = converted.taxesMonthly;
    els.insuranceMonthly.value = converted.insuranceMonthly;
    els.hoaMonthly.value = converted.hoaMonthly;

    els.viewModeLabel.textContent = (toMode === "annual") ? "Annual view" : "Monthly view";
    setCarryCostLabels(toMode);
    els.viewModeToggle.dataset.mode = toMode;

    triggerCompute();
  });

  function setCarryCostLabels(mode) {
    const sfx = mode === "annual" ? " (Annual)" : " (Monthly)";
    els.taxesLabel.textContent = "Taxes" + sfx;
    els.insuranceLabel.textContent = "Insurance" + sfx;
    els.hoaLabel.textContent = "HOA" + sfx;
  }

  function hardResetForm() {
    [
      els.address, els.link, els.propertyValue, els.percentDownPct, els.rateAprPct,
      els.loanLengthYears, els.estFixingCost, els.taxesMonthly, els.insuranceMonthly,
      els.hoaMonthly, els.monthsHold, els.desiredARV, els.comments
    ].forEach(el => { if (!el) return; el.value = (el.id === "loanLengthYears") ? 30 : ""; });
    els.interestOnlyToggle.checked = false;

    // Initialize toggle state & labels deterministically
    els.viewModeToggle.checked = false;
    els.viewModeToggle.dataset.mode = "monthly";
    els.viewModeLabel.textContent = "Monthly view";
    setCarryCostLabels("monthly");

    lastSavedSnapshot = JSON.stringify(collectForm());

    els.addOrSaveBtn.textContent = "Add Property to Catalogue";
    delete els.addOrSaveBtn.dataset.dupId;

    triggerCompute();
  }

  // Show more/less label
  if (els.moreDetails) {
    const summary = els.moreDetails.querySelector("summary");
    const syncLabel = () => { summary.textContent = els.moreDetails.open ? "Show less" : "Show more"; };
    els.moreDetails.addEventListener("toggle", syncLabel);
    setTimeout(syncLabel, 0);
  }

  // Recompute on input
  const watched = ["address", "link", "propertyValue", "percentDownPct", "rateAprPct", "loanLengthYears",
    "estFixingCost", "taxesMonthly", "insuranceMonthly", "hoaMonthly", "monthsHold", "desiredARV", "comments"];
  ["input", "change"].forEach(evt => {
    watched.forEach(id => {
      const el = els[id];
      if (!el) return;
      el.addEventListener(evt, () => { checkDuplicateAddressUI(); triggerCompute(); });
    });
  });
  els.interestOnlyToggle.addEventListener("change", () => { triggerCompute(); });

  // Nav soft-confirm if unsaved with valid KPI
  document.querySelectorAll(".nav a").forEach(a => {
    a.addEventListener("click", async (e) => {
      if (shouldWarnUnsaved()) {
        e.preventDefault();
        const ok = await showConfirm({
          title: "Unsaved changes",
          message: "You have unsaved changes with valid KPIs. Leave and lose changes?",
          okText: "Proceed anyway",
          cancelText: "Go back"
        });
        if (ok) window.location.href = a.href;
      }
    });
  });

  function collectForm() {
    return {
      address: els.address.value,
      link: els.link.value,
      propertyValue: els.propertyValue.value,
      percentDownPct: els.percentDownPct.value,
      rateAprPct: els.rateAprPct.value,
      loanLengthYears: els.loanLengthYears.value,
      estFixingCost: els.estFixingCost.value,
      taxesMonthly: els.taxesMonthly.value,
      insuranceMonthly: els.insuranceMonthly.value,
      hoaMonthly: els.hoaMonthly.value,
      monthsHold: els.monthsHold.value,
      desiredARV: els.desiredARV.value,
      interestOnly: els.interestOnlyToggle.checked ? 1 : 0,
      comments: els.comments.value
    };
  }

  function shouldWarnUnsaved() {
    const snap = JSON.stringify(collectForm());
    const haveUnsaved = (lastSavedSnapshot !== snap);
    const k = computeFRAT(collectNums());
    const kpisValid = isFinite(k.roi);
    return haveUnsaved && kpisValid;
  }

  function collectNums() {
    const f = collectForm();
    // Normalize carry costs to monthly for calculations, regardless of toggle
    let taxesMonthly = +f.taxesMonthly;
    let insuranceMonthly = +f.insuranceMonthly;
    let hoaMonthly = +f.hoaMonthly;
    const mode = els.viewModeToggle.dataset.mode || "monthly";
    if (mode === "annual") {
      taxesMonthly = taxesMonthly / 12;
      insuranceMonthly = insuranceMonthly / 12;
      hoaMonthly = hoaMonthly / 12;
    }
    return {
      propertyValue: +f.propertyValue,
      percentDownPct: +f.percentDownPct,
      rateAprPct: +f.rateAprPct,
      loanLengthYears: +(f.loanLengthYears || 30),
      estFixingCost: +f.estFixingCost,
      taxesMonthly,
      insuranceMonthly,
      hoaMonthly,
      monthsHold: +f.monthsHold,
      desiredARV: +f.desiredARV,
      interestOnly: !!(+f.interestOnly),
    };
  }

  function checkDuplicateAddressUI() {
    const dup = findDuplicateByAddress(els.address.value);
    if (dup && !isEditMode) {
      els.addOrSaveBtn.textContent = "View/Update Pre-Existing Property in Catalogue";
      els.addOrSaveBtn.dataset.dupId = dup.id;
    } else {
      els.addOrSaveBtn.textContent = isEditMode ? "Save Changes" : "Add Property to Catalogue";
      delete els.addOrSaveBtn.dataset.dupId;
    }
  }

  function initPlaceholders() {
    els.suggestedARV.innerHTML = `
      <tr><td>ROI 40%</td><td>N/A</td></tr>
      <tr><td>ROI 30%</td><td>N/A</td></tr>
      <tr><td>ROI 20%</td><td>N/A</td></tr>
      <tr><td>ROI 10%</td><td>N/A</td></tr>`;
    els.netIncomeBox.innerHTML = `
      <div class="card"><div class="small">Net Income</div><div style="font-weight:800;font-size:18px">N/A</div></div>`;
    els.kpiBadges.innerHTML = `<div class="kpi na">ROI N/A</div>`;
  }

  function triggerCompute() {
    const n = collectNums();
    const r = computeFRAT(n);
    renderKPIs(r);
    renderNetIncome(r);
    renderSuggestedARV(r);
    renderSupplemental(r);
  }

  function renderKPIs(r) {
    const roiPct = isFinite(r.roi) ? (r.roi * 100).toFixed(2) + "%" : "N/A";
    const band = bandROI(r.roi);
    const tip = "ROI = (Desired ARV − Total Losses) / Total Losses";
    els.kpiBadges.innerHTML = `<div class="${kpiClass(band)}" title="${tip}">ROI <span class="value">${roiPct}</span></div>`;
  }

  function renderNetIncome(r) {
    const v = isFinite(r.netIncome) ? formatMoney(r.netIncome) : "N/A";
    els.netIncomeBox.innerHTML = `
      <div class="card"><div class="small">Net Income</div><div style="font-weight:800;font-size:18px">${v}</div></div>`;
  }

  function renderSuggestedARV(r) {
    const cell = (v) => isFinite(v) ? formatMoney(v) : "N/A";
    els.suggestedARV.innerHTML = `
      <tr><td>ROI 40%</td><td>${cell(r.targets.arv40)}</td></tr>
      <tr><td>ROI 30%</td><td>${cell(r.targets.arv30)}</td></tr>
      <tr><td>ROI 20%</td><td>${cell(r.targets.arv20)}</td></tr>
      <tr><td>ROI 10%</td><td>${cell(r.targets.arv10)}</td></tr>`;
  }

  function renderSupplemental(r) {
    const s = r.supp;
    const rows = [
      { label: "Down Payment", val: formatMoney(s.downPayment), tip: "Down = Property Value × Percent Down" },
      { label: "Closing Costs (5%)", val: formatMoney(s.closingCosts), tip: "Closing = Property Value × 5%" },
      { label: "Loan Amount", val: formatMoney(s.loanAmount), tip: "Loan = Property Value − Down" },
      { label: "Mortgage (Monthly)", val: formatMoney(s.mortgageMonthly), tip: s.interestOnly ? "Interest-only: Loan × (APR/12)" : "PMT = r·L / (1 − (1+r)^−n)" },
      { label: "Operating Expenses (Monthly)", val: formatMoney(s.operatingExpensesMonthly), tip: "Taxes + Insurance + HOA + Misc(1%/yr ÷ 12)" },
      { label: "Ownership Cost (Monthly)", val: formatMoney(s.ownershipCostMonthly), tip: "OpEx + Mortgage" },
      { label: "Holding Loss (Months × Ownership)", val: formatMoney(s.holdingLoss), tip: "Ownership per month × Months to hold" },
      {
        label: s.interestOnly ? "Initial Loan Amount counted in Losses" : "Remaining Loan Amount counted in Losses",
        val: formatMoney(s.loanCountedInLosses),
        tip: s.interestOnly ? "Using initial loan due to interest-only scenario" : "Remaining balance after N months"
      },
      { label: "Estimated Fixing Cost", val: formatMoney(s.estFixingCost), tip: "As entered" },
      { label: "Total Losses", val: formatMoney(r.totalLosses), tip: "Down + Closing + Loan (counted) + Fixing + Holding Loss" }
    ];
    els.supplemental.innerHTML = rows.map(row =>
      `<div class="row" style="justify-content:space-between" title="${row.tip}">
         <div class="small">${row.label}</div><div>${row.val}</div>
       </div>`
    ).join("");
  }

  // Add / Save with duplicate protection
  els.addOrSaveBtn.addEventListener("click", () => {
    if (!isEditMode && els.addOrSaveBtn.dataset.dupId) {
      const id = els.addOrSaveBtn.dataset.dupId;
      location.href = `FRAT.html?edit=${id}`;
      return;
    }

    const n = collectNums();
    const minimalOk = (+n.propertyValue > 0 && +n.percentDownPct >= 0 && +n.rateAprPct >= 0);
    if (!minimalOk) {
      showToast("Provide at least: Property Value, Percent Down, Rate.", "info", { title: "Missing required inputs" });
      return;
    }

    const r = computeFRAT(n);
    const core = {
      module: "FRAT",
      source: { address: els.address.value || "", link: els.link.value || "", entryMode: "manual" },
      inputs: {
        propertyValue: +n.propertyValue,
        percentDownPct: +n.percentDownPct,
        rateAprPct: +n.rateAprPct,
        loanLengthYears: +n.loanLengthYears,
        estFixingCost: +n.estFixingCost,
        taxesMonthly: +n.taxesMonthly,
        insuranceMonthly: +n.insuranceMonthly,
        hoaMonthly: +n.hoaMonthly,
        monthsHold: +n.monthsHold,
        desiredARV: +n.desiredARV,
        interestOnly: !!n.interestOnly,
        comments: els.comments.value || "",
        closingCostsRate: 0.05,
        miscRateAnnual: 0.01
      },
      computed: {
        ownershipCostMonthly: round2(r.supp.ownershipCostMonthly),
        operatingExpensesMonthly: round2(r.supp.operatingExpensesMonthly),
        mortgageMonthly: round2(r.supp.mortgageMonthly),
        netIncome: round2(r.netIncome),
        roi: r.roi,
        suggestedARV: {
          roi40: r.targets.arv40,
          roi30: r.targets.arv30,
          roi20: r.targets.arv20,
          roi10: r.targets.arv10
        }
      },
      bands: { roi: bandROI(r.roi).label }
    };

    if (isEditMode) {
      updatePropertyInCatalog(editId, (prev) => ({ ...prev, ...core, updatedAt: new Date().toISOString() }));
      showToast("Changes saved.", "success");
      lastSavedSnapshot = JSON.stringify(collectForm());
    } else {
      const newId = (crypto.randomUUID ? crypto.randomUUID() : (String(Date.now()) + Math.random().toString(16).slice(2)));
      const prop = { id: newId, createdAt: new Date().toISOString(), pinned: false, ...core };
      savePropertyToCatalog(prop);
      showToast("Property added. Opening for edit.", "success");
      location.href = `FRAT.html?edit=${newId}`;
      return;
    }

    checkDuplicateAddressUI();
  });

  // Clear
  els.clearBtn.addEventListener("click", () => { hardResetForm(); });

  // Back button same as GRASP
  const backBtn = document.getElementById('backBtn');
  if (backBtn) { backBtn.addEventListener('click', (e) => { e.preventDefault(); history.back(); }); }

  // ---------- FRAT math ----------
  function computeFRAT(n) {
  const pv = n.propertyValue || 0;
  const down = pv * ((n.percentDownPct || 0) / 100);
  const loan = Math.max(pv - down, 0);
  const closing = pv * 0.05;
  const miscMonthly = pv * 0.01 / 12;

  // Ensure all values are monthly
  const taxesMonthly = n.taxesMonthly || 0;
  const insuranceMonthly = n.insuranceMonthly || 0;
  const hoaMonthly = n.hoaMonthly || 0;

  const r = (n.rateAprPct || 0) / 100 / 12;
  const N = (n.loanLengthYears || 30) * 12;

  const pmtStandard = (r > 0 ? (r * loan) / (1 - Math.pow(1 + r, -N)) : 0);
  const pmtInterestOnly = loan * r;
  const mortgageMonthly = n.interestOnly ? pmtInterestOnly : pmtStandard;

  // Use only monthly values for operating expenses
  const operatingMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + miscMonthly;
  const ownershipMonthly = operatingMonthly + mortgageMonthly;

    const m = Math.max(0, Math.floor(n.monthsHold || 0));
    let remainingBalance = loan;
    if (m > 0) {
      if (n.interestOnly) {
        if (m <= 12) {
          remainingBalance = loan;
        } else {
          const monthsAfterIO = m - 12;
          if (r > 0 && N > 0) {
            remainingBalance = loan * Math.pow(1 + r, monthsAfterIO) - pmtStandard * ((Math.pow(1 + r, monthsAfterIO) - 1) / r);
          }
        }
      } else if (r > 0 && N > 0) {
        remainingBalance = loan * Math.pow(1 + r, m) - pmtStandard * ((Math.pow(1 + r, m) - 1) / r);
      }
    }

    const loanCounted = n.interestOnly && m <= 12 ? loan : remainingBalance;
    const holdingLoss = ownershipMonthly * m;
    const totalLosses = down + closing + loanCounted + (n.estFixingCost || 0) + holdingLoss;

    const desiredARV = n.desiredARV || NaN;
    const netIncome = isFinite(desiredARV) ? (desiredARV - totalLosses) : NaN;
    const roi = isFinite(netIncome) && totalLosses > 0 ? netIncome / totalLosses : NaN;

    const targetARV = pct => totalLosses > 0 ? totalLosses * (1 + pct) : NaN;

    return {
      roi, netIncome, desiredARV, totalLosses,
      targets: { arv40: targetARV(0.40), arv30: targetARV(0.30), arv20: targetARV(0.20), arv10: targetARV(0.10) },
      supp: {
        downPayment: down,
        closingCosts: closing,
        loanAmount: loan,
        mortgageMonthly,
        operatingExpensesMonthly: operatingMonthly,
        ownershipCostMonthly: ownershipMonthly,
        estFixingCost: n.estFixingCost || 0,
        holdingLoss,
        loanCountedInLosses: loanCounted,
        interestOnly: !!n.interestOnly
      }
    };
  }

  function bandROI(v) {
    if (!isFinite(v)) return { label: "N/A" };
    if (v > 0.40) return { label: "Amazing" };
    if (v >= 0.30) return { label: "Great" };
    if (v >= 0.20) return { label: "Good" };
    if (v >= 0.10) return { label: "Okay" };
    if (v >= 0) return { label: "Bad" };
    return { label: "Negative" };
  }
});