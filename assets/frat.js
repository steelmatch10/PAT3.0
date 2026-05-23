/* FRAT page behavior — fixed Monthly/Annual toggle */
document.addEventListener("DOMContentLoaded", async () => {
  window._patCurrentMember = null;

  // ── Auth gate ────────────────────────────────────────────────────────────────
  const user = await initAuth();
  if (!user) return; // redirected to login.html

  const member  = await getCurrentMember();
  const founder = member?.global_role === "founder";

  initProfileWidget(user, member);
  document.getElementById("logoutBtn").addEventListener("click", patSignOut);

  // ── Access check — investor read-only enforcement ────────────────────────────
  const _fratParams   = new URLSearchParams(location.search);
  const _fratPropId   = _fratParams.get("propertyId");
  let readOnly = false;
  if (!founder && _fratPropId) {
    const approvedIds = await fetchApprovedPropertyIds();
    if (!approvedIds.has(_fratPropId)) {
      readOnly = true;
    }
  }

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
  let isDirty = false;

  initPlaceholders();

  if (readOnly) {
    document.getElementById("readOnlyBanner").style.display = "block";
    document.querySelectorAll("input, select, textarea").forEach(el => {
      el.disabled = true;
    });
    els.addOrSaveBtn.style.display = "none";
    els.clearBtn.style.display     = "none";
  }

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
      document.body.dataset.carryMode = "monthly";
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
    const currentMode = document.body.dataset.carryMode || "monthly";
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
    document.body.dataset.carryMode = toMode;

    triggerCompute();
  });

  function hardResetForm() {
    [
      els.address, els.link, els.propertyValue, els.percentDownPct, els.rateAprPct,
      els.loanLengthYears, els.estFixingCost, els.taxesMonthly, els.insuranceMonthly,
      els.hoaMonthly, els.monthsHold, els.desiredARV, els.comments
    ].forEach(el => { if (!el) return; el.value = (el.id === "loanLengthYears") ? 30 : ""; });
    els.interestOnlyToggle.checked = false;

    // Initialize toggle state & labels deterministically
    els.viewModeToggle.checked = false;
    document.body.dataset.carryMode = "monthly";
    els.viewModeLabel.textContent = "Monthly view";
    setCarryCostLabels("monthly");

    isDirty = false;
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
      el.addEventListener(evt, () => {
        isDirty = true;
        checkDuplicateAddressUI(els.address.value, els.addOrSaveBtn, isEditMode);
        triggerCompute();
        historyGuard.tryInstallOrUninstall();
      });
    });
  });
  els.interestOnlyToggle.addEventListener("change", () => {
    isDirty = true;
    triggerCompute();
    historyGuard.tryInstallOrUninstall();
  });

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
    const mode = document.body.dataset.carryMode || "monthly";
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

  function initPlaceholders() {
    const [i1, i2, i3, i4] = CONSTANTS.ROI_BANDS.map(v => (v * 100) + "%");
    els.suggestedARV.innerHTML = `
      <tr><td>ROI ${i1}</td><td>N/A</td></tr>
      <tr><td>ROI ${i2}</td><td>N/A</td></tr>
      <tr><td>ROI ${i3}</td><td>N/A</td></tr>
      <tr><td>ROI ${i4}</td><td>N/A</td></tr>`;
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
    const [r1, r2, r3, r4] = CONSTANTS.ROI_BANDS.map(v => (v * 100) + "%");
    els.suggestedARV.innerHTML = `
      <tr><td>ROI ${r1}</td><td>${cell(r.targets.arv40)}</td></tr>
      <tr><td>ROI ${r2}</td><td>${cell(r.targets.arv30)}</td></tr>
      <tr><td>ROI ${r3}</td><td>${cell(r.targets.arv20)}</td></tr>
      <tr><td>ROI ${r4}</td><td>${cell(r.targets.arv10)}</td></tr>`;
  }

  function renderSupplemental(r) {
    const s = r.supp;
    const rows = [
      { label: "Down Payment", val: formatMoney(s.downPayment), tip: "Down = Property Value × Percent Down" },
      { label: "Closing Costs (est.)", val: formatMoney(s.closingCosts), tip: `Closing = flat ${formatMoney(CONSTANTS.CLOSING_COSTS)} worst-case estimate` },
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
        closingCosts: CONSTANTS.CLOSING_COSTS,
        miscRateAnnual: CONSTANTS.MISC_RATE_ANNUAL
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
      const snap = JSON.stringify(collectForm());
      if (lastSavedSnapshot === snap) {
        showToast("No Changes Made", "info");
        return;
      }
      updatePropertyInCatalog(editId, (prev) => ({ ...prev, ...core, updatedAt: new Date().toISOString() }));
      showToast("Changes saved.", "success");
      lastSavedSnapshot = snap;
      isDirty = false;
      // Navigate to catalogue and show updated property at top
      window.location.href = "Catalogue.html";
      return;
    } else {
      const newId = (crypto.randomUUID ? crypto.randomUUID() : (String(Date.now()) + Math.random().toString(16).slice(2)));
      const prop = { id: newId, createdAt: new Date().toISOString(), pinned: false, ...core };
      savePropertyToCatalog(prop);
      showToast("Property added. Opening for edit.", "success");
      location.href = `FRAT.html?edit=${newId}`;
      return;
    }

    checkDuplicateAddressUI(els.address.value, els.addOrSaveBtn, isEditMode);
  });

  // Clear
  els.clearBtn.addEventListener("click", () => { hardResetForm(); });

  // ----- Custom Back/Forward Guard via History API -----
  const historyGuard = (function () {
    let guardInstalled = false;
    let restoring = false;

    function installGuard() {
      if (guardInstalled) return;
      if (!shouldWarnUnsaved()) return;
      guardInstalled = true;
      history.replaceState({ patGuard: "anchor" }, document.title);
      history.pushState({ patGuard: "trap" }, document.title);
      window.addEventListener("popstate", onPopState);
    }

    function uninstallGuard() {
      if (!guardInstalled) return;
      window.removeEventListener("popstate", onPopState);
      guardInstalled = false;
    }

    async function onPopState(ev) {
      if (restoring) { restoring = false; return; }
      if (!shouldWarnUnsaved()) {
        uninstallGuard();
        history.back();
        return;
      }
      const ok = await showConfirm({
        title: "Unsaved changes",
        message: "You have unsaved changes with valid KPIs. Leave and lose changes?",
        okText: "Proceed anyway",
        cancelText: "Go back"
      });
      if (ok) {
        uninstallGuard();
        history.back();
      } else {
        restoring = true;
        history.pushState({ patGuard: "trap" }, document.title);
      }
    }

    function tryInstallOrUninstall() {
      if (shouldWarnUnsaved()) installGuard();
      else uninstallGuard();
    }

    tryInstallOrUninstall();
    return { tryInstallOrUninstall };
  })();

  // Back button with unsaved-changes protection
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', async (e) => {
      if (shouldWarnUnsaved()) {
        e.preventDefault();
        const ok = await showConfirm({
          title: "Unsaved changes",
          message: "You have unsaved changes with valid KPIs. Leave and lose changes?",
          okText: "Proceed anyway",
          cancelText: "Go back"
        });
        if (ok) history.back();
      }
    });
  }

  // ---------- FRAT math ----------
  function computeFRAT(n) {
  const pv = n.propertyValue || 0;
  const down = pv * ((n.percentDownPct || 0) / 100);
  const loan = Math.max(pv - down, 0);
  const closing = CONSTANTS.CLOSING_COSTS;
  const miscMonthly = pv * CONSTANTS.MISC_RATE_ANNUAL / 12;

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
      targets: { arv40: targetARV(CONSTANTS.ROI_BANDS[0]), arv30: targetARV(CONSTANTS.ROI_BANDS[1]), arv20: targetARV(CONSTANTS.ROI_BANDS[2]), arv10: targetARV(CONSTANTS.ROI_BANDS[3]) },
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
    if (v > CONSTANTS.ROI_BANDS[0]) return { label: "Amazing" };
    if (v >= CONSTANTS.ROI_BANDS[1]) return { label: "Great" };
    if (v >= CONSTANTS.ROI_BANDS[2]) return { label: "Good" };
    if (v >= CONSTANTS.ROI_BANDS[3]) return { label: "Okay" };
    if (v >= 0) return { label: "Bad" };
    return { label: "Negative" };
  }
});