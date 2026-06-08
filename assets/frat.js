/* FRAT page behavior — fixed Monthly/Annual toggle */
document.addEventListener("DOMContentLoaded", async () => {
  window._patCurrentMember = null;

  // ── Auth gate ────────────────────────────────────────────────────────────────
  const authSpinner = document.getElementById("authSpinner");
  const mainContent = document.getElementById("mainContent");

  const user = await initAuth();
  if (!user) return; // redirected to login.html

  const member  = await getCurrentMember();
  const founder = member?.global_role === "founder";

  authSpinner.style.display = "none";
  mainContent.classList.add("visible");

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
    fullAddress:  document.getElementById("fullAddress"),
    addressHint:  document.getElementById("addressHint"),
    addrStreet: document.getElementById("addr-street"),
    addrCity:   document.getElementById("addr-city"),
    addrState:  document.getElementById("addr-state"),
    addrZip:    document.getElementById("addr-zip"),
    link: document.getElementById("link"),
    scenarioName:        document.getElementById("scenarioName"),
    scenarioDescription: document.getElementById("scenarioDescription"),
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
    clearBtn:     document.getElementById("clearBtn"),
    saveError:    document.getElementById("saveError"),

    viewModeToggle: document.getElementById("viewModeToggle"),
    viewModeLabel: document.getElementById("viewModeLabel"),
    taxesLabel: document.getElementById("taxesLabel"),
    insuranceLabel: document.getElementById("insuranceLabel"),
    hoaLabel: document.getElementById("hoaLabel"),

    kpiBadges:        document.getElementById("kpiBadges"),
    capitalRequired:  document.getElementById("capitalRequired"),
    capitalBreakdown: document.getElementById("capitalBreakdown"),
    netIncomeBox: document.getElementById("netIncomeBox"),
    suggestedARV: document.getElementById("suggestedARV"),
    supplemental: document.getElementById("supplemental"),
    moreDetails: document.getElementById("moreDetails"),

    scenarioBar:        document.getElementById("scenarioBar"),
    scenarioSelect:     document.getElementById("scenarioSelect"),
    newScenarioBtn:     document.getElementById("newScenarioBtn"),
    scenarioActionsBar: document.getElementById("scenarioActionsBar"),
    archiveScenarioBtn: document.getElementById("archiveScenarioBtn"),
    archivedBadge:      document.getElementById("archivedBadge"),
  };

  let lastSavedSnapshot = null;
  let isDirty = false;
  let currentScenarioId = null;
  let currentPropertyId = _fratPropId || null;
  let allScenarios = [];
  let currentProperty = null;

  // Initialize view mode from localStorage (shared preference with GRASP)
  {
    const saved = readViewMode();
    const startMode = saved === "annual" ? "annual" : "monthly";
    document.body.dataset.carryMode = startMode;
    els.viewModeToggle.checked = startMode === "annual";
    els.viewModeLabel.textContent = startMode === "annual" ? "Annual view" : "Monthly view";
    setCarryCostLabels(startMode);
  }

  initPlaceholders();

  if (readOnly) {
    document.getElementById("readOnlyBanner").style.display = "block";
    document.querySelectorAll("input, select, textarea").forEach(el => {
      el.disabled = true;
    });
    if (els.scenarioSelect) els.scenarioSelect.disabled = false;
    els.addOrSaveBtn.style.display  = "none";
    els.clearBtn.style.display      = "none";
    if (els.newScenarioBtn)     els.newScenarioBtn.style.display     = "none";
    if (els.archiveScenarioBtn) els.archiveScenarioBtn.style.display = "none";
  }

  if (_fratPropId) {
    els.scenarioBar.style.display = "flex";
    [allScenarios, currentProperty] = await Promise.all([
      fetchScenarios(_fratPropId),
      fetchProperty(_fratPropId),
    ]);

    if (!founder) setAddressReadonly(true);

    renderScenarioSelect(allScenarios);

    if (allScenarios.length > 0) {
      loadScenarioIntoForm(allScenarios[0]);
    } else {
      clearFormForNew({
        street: currentProperty?.street      ?? "",
        city:   currentProperty?.city        ?? "",
        state:  currentProperty?.state       ?? "",
        zip:    currentProperty?.zip         ?? "",
        link:   currentProperty?.zillow_link ?? "",
      });
    }

    els.scenarioSelect.addEventListener("change", () => {
      const sel = allScenarios.find(s => s.id === els.scenarioSelect.value);
      if (sel) loadScenarioIntoForm(sel);
      else clearFormForNew();
    });

    els.newScenarioBtn.addEventListener("click", () => {
      currentScenarioId = null;
      els.scenarioSelect.value = "";
      const lastTaxesAnnual = allScenarios[0]?.inputs?.taxesAnnual ?? null;
      clearFormForNew({
        street:      currentProperty?.street      ?? "",
        city:        currentProperty?.city        ?? "",
        state:       currentProperty?.state       ?? "",
        zip:         currentProperty?.zip         ?? "",
        link:        currentProperty?.zillow_link ?? "",
        taxesAnnual: lastTaxesAnnual,
      });
      els.scenarioActionsBar.style.display = "none";
      els.archivedBadge.style.display = "none";
    });

    els.archiveScenarioBtn.addEventListener("click", async () => {
      if (!currentScenarioId) return;
      const ok = await showConfirm({
        title: "Archive scenario",
        message: "Archive this scenario? It won't appear by default, but can be restored.",
        okText: "Archive",
        cancelText: "Cancel",
      });
      if (!ok) return;
      try {
        await archiveScenario(currentScenarioId);
        showToast("Scenario archived.", "success");
        allScenarios = await fetchScenarios(_fratPropId);
        renderScenarioSelect(allScenarios);
        if (allScenarios.length > 0) loadScenarioIntoForm(allScenarios[0]);
        else clearFormForNew();
      } catch (err) {
        showSaveError(err.message || "Failed to archive scenario.");
      }
    });

    // ── Property actions bar (founders only) ────────────────────────────────
    if (founder) {
      const propBar        = document.getElementById("propertyActionsBar");
      const statusSelect   = document.getElementById("listingStatusSelect");
      const statusBadge    = document.getElementById("listingStatusBadge");
      const archivePropBtn = document.getElementById("archivePropertyBtn");
      const deletePropBtn  = document.getElementById("deletePropertyBtn");

      if (propBar) {
        propBar.style.display = "flex";

        const currentStatus = currentProperty?.listing_status || "";
        if (statusSelect) statusSelect.value = currentStatus;
        if (statusBadge && currentStatus) {
          statusBadge.textContent = currentStatus;
          statusBadge.style.display = "inline";
        }

        const ARCHIVE_STATUSES = ["Sold", "Off Market"];
        function syncArchiveBtn() {
          const val = statusSelect?.value || "";
          if (archivePropBtn) archivePropBtn.disabled = !ARCHIVE_STATUSES.includes(val);
        }
        syncArchiveBtn();
        statusSelect?.addEventListener("change", syncArchiveBtn);

        archivePropBtn?.addEventListener("click", async () => {
          const status = statusSelect?.value;
          if (!ARCHIVE_STATUSES.includes(status)) return;
          const choice = await showArchiveModal(status);
          if (choice === "cancel") return;
          try {
            await setPropertyListingStatus(currentPropertyId, status);
            if (currentProperty) currentProperty.listing_status = status;
            if (statusBadge) { statusBadge.textContent = status; statusBadge.style.display = "inline"; }
            if (choice === "archive-stage") {
              await stageDeletion(currentPropertyId);
              if (currentProperty) currentProperty.staged_for_deletion_at = new Date().toISOString();
              showToast("Property archived and staged for removal in 5 business days.", "success");
            } else if (choice === "remove") {
              await softDeleteProperty(currentPropertyId);
              showToast("Property removed from Catalogue.", "success");
              window.location.href = "index.html";
            } else {
              showToast("Property archived.", "success");
            }
          } catch (err) {
            showToast(err.message || "Failed to archive property.", "error");
          }
        });

        deletePropBtn?.addEventListener("click", async () => {
          const choice = await showDeleteModal();
          if (choice === "cancel") return;
          try {
            if (choice === "remove") {
              await softDeleteProperty(currentPropertyId);
              showToast("Property removed from Catalogue.", "success");
              window.location.href = "index.html";
            } else if (choice === "stage") {
              await stageDeletion(currentPropertyId);
              if (currentProperty) currentProperty.staged_for_deletion_at = new Date().toISOString();
              showToast("Property staged for removal in 5 business days. Undo in Catalogue.", "success");
            }
          } catch (err) {
            showToast(err.message || "Failed to remove property.", "error");
          }
        });
      }
    }
  } else {
    clearFormForNew();
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
    saveViewMode(toMode);

    triggerCompute();
  });

  function renderScenarioSelect(scenarios) {
    const opts = scenarios.map(s => {
      const label = s.scenario_name + (s.archived_at ? " (archived)" : "");
      return `<option value="${s.id}">${label}</option>`;
    });
    if (scenarios.length === 0) {
      opts.push('<option value="">No scenarios — create one below</option>');
    }
    els.scenarioSelect.innerHTML = opts.join("");
    if (scenarios.length > 0) els.scenarioSelect.value = scenarios[0].id;
    else els.scenarioSelect.value = "";
  }

  function loadScenarioIntoForm(scenario) {
    currentScenarioId = scenario.id;
    const inp = scenario.inputs || {};
    const mode = document.body.dataset.carryMode || "monthly";

    if (els.scenarioName)        els.scenarioName.value        = scenario.scenario_name || "";
    if (els.scenarioDescription) els.scenarioDescription.value = scenario.scenario_description || "";
    els.addrStreet.value      = currentProperty?.street      ?? "";
    els.addrCity.value        = currentProperty?.city        ?? "";
    els.addrState.value       = currentProperty?.state       ?? "";
    els.addrZip.value         = currentProperty?.zip         ?? "";
    if (els.fullAddress) {
      els.fullAddress.value = assembleAddress({ street: currentProperty?.street ?? "", city: currentProperty?.city ?? "", state: currentProperty?.state ?? "", zip: currentProperty?.zip ?? "" });
      if (els.addressHint) els.addressHint.style.display = "none";
    }
    els.link.value            = currentProperty?.zillow_link ?? "";
    els.propertyValue.value   = inp.propertyValue  ?? "";
    els.percentDownPct.value  = inp.percentDownPct ?? "";
    els.rateAprPct.value      = inp.rateAprPct     ?? "";
    els.loanLengthYears.value = inp.loanLengthYears ?? 30;
    els.estFixingCost.value   = inp.estFixingCost  ?? "";
    els.monthsHold.value      = inp.monthsHold     ?? "";
    els.desiredARV.value      = inp.desiredARV     ?? "";
    els.comments.value        = inp.comments       ?? "";
    els.interestOnlyToggle.checked = !!inp.interestOnly;

    // taxesAnnual stored annually; display based on current view mode
    const taxesAnnual = inp.taxesAnnual ?? 0;
    els.taxesMonthly.value     = mode === "annual" ? taxesAnnual : round2(taxesAnnual / 12);
    const insM = inp.insuranceMonthly ?? 0;
    const hoaM = inp.hoaMonthly ?? 0;
    els.insuranceMonthly.value = mode === "annual" ? round2(insM * 12) : insM;
    els.hoaMonthly.value       = mode === "annual" ? round2(hoaM * 12) : hoaM;

    // Archive state
    if (scenario.archived_at) {
      els.archivedBadge.style.display = "inline";
      if (els.archiveScenarioBtn) els.archiveScenarioBtn.style.display = "none";
    } else {
      els.archivedBadge.style.display = "none";
      if (!readOnly && els.archiveScenarioBtn) {
        els.archiveScenarioBtn.style.display = "";
        els.scenarioActionsBar.style.display = "flex";
      }
    }

    triggerCompute();
    lastSavedSnapshot = JSON.stringify(collectForm());
    els.addOrSaveBtn.disabled = true;
    els.addOrSaveBtn.textContent = "Save Changes";
  }

  function clearFormForNew(defaults = {}) {
    currentScenarioId = null;
    lastSavedSnapshot = null;

    if (els.scenarioName)        els.scenarioName.value        = "";
    if (els.scenarioDescription) els.scenarioDescription.value = "";
    els.addrStreet.value      = defaults.street ?? "";
    els.addrCity.value        = defaults.city   ?? "";
    els.addrState.value       = defaults.state  ?? "";
    els.addrZip.value         = defaults.zip    ?? "";
    if (els.fullAddress) {
      els.fullAddress.value = assembleAddress({ street: defaults.street ?? "", city: defaults.city ?? "", state: defaults.state ?? "", zip: defaults.zip ?? "" });
      if (els.addressHint) els.addressHint.style.display = "none";
    }
    els.link.value            = defaults.link   ?? "";
    els.propertyValue.value   = "";
    els.percentDownPct.value  = "";
    els.rateAprPct.value      = "";
    els.loanLengthYears.value = "30";
    els.estFixingCost.value   = "";
    els.monthsHold.value      = "";
    els.desiredARV.value      = "";
    els.comments.value        = "";
    els.interestOnlyToggle.checked = false;

    // Carry taxes from previous scenario if provided
    const mode = document.body.dataset.carryMode || "monthly";
    if (defaults.taxesAnnual != null) {
      els.taxesMonthly.value = mode === "annual" ? defaults.taxesAnnual : round2(defaults.taxesAnnual / 12);
    } else {
      els.taxesMonthly.value = "";
    }
    els.insuranceMonthly.value = "";
    els.hoaMonthly.value       = "";

    if (els.archivedBadge) els.archivedBadge.style.display = "none";

    isDirty = false;
    els.addOrSaveBtn.textContent = "Save Scenario";
    els.addOrSaveBtn.disabled    = false;

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
  const watched = ["scenarioName", "scenarioDescription", "link", "propertyValue", "percentDownPct", "rateAprPct", "loanLengthYears",
    "estFixingCost", "taxesMonthly", "insuranceMonthly", "hoaMonthly", "monthsHold", "desiredARV", "comments"];
  ["input", "change"].forEach(evt => {
    watched.forEach(id => {
      const el = els[id];
      if (!el) return;
      el.addEventListener(evt, () => {
        isDirty = true;
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
      scenarioName:        els.scenarioName?.value        ?? "",
      scenarioDescription: els.scenarioDescription?.value ?? "",
      street: els.addrStreet.value,
      city:   els.addrCity.value,
      state:  els.addrState.value,
      zip:    els.addrZip.value,
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
    renderCapitalRequired(r);
    renderNetIncome(r);
    renderSuggestedARV(r);
    renderSupplemental(r);
    if (lastSavedSnapshot !== null) {
      els.addOrSaveBtn.disabled = (JSON.stringify(collectForm()) === lastSavedSnapshot);
    }
  }

  function renderCapitalRequired(r) {
    if (!els.capitalRequired) return;
    const s = r.supp;
    const total = (s.downPayment || 0) + (s.closingCosts || 0) + (s.estFixingCost || 0);
    els.capitalRequired.textContent = total > 0 ? formatMoney(total) : '—';
    els.capitalBreakdown.textContent = total > 0
      ? `${formatMoney(s.downPayment || 0)} down · ${formatMoney(s.closingCosts || 0)} closing · ${formatMoney(s.estFixingCost || 0)} rehab`
      : 'Enter property value and down % to calculate';
  }

  function parseFullAddress(value) {
    const parts = value.split(',');
    if (parts.length < 2) return null;
    const street = parts[0].trim();
    const lastTokens = parts[parts.length - 1].trim().split(/\s+/);
    const zip   = /^\d{5}(-\d{4})?$/.test(lastTokens[lastTokens.length - 1]) ? lastTokens[lastTokens.length - 1] : '';
    const state = /^[A-Za-z]{2}$/.test(lastTokens[lastTokens.length - (zip ? 2 : 1)])
      ? lastTokens[lastTokens.length - (zip ? 2 : 1)].toUpperCase()
      : '';
    const city  = parts.slice(1, -1).join(',').trim();
    return { street, city, state, zip };
  }

  function assembleAddress({ street, city, state, zip }) {
    const parts = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean);
    return parts.join(', ');
  }

  function applyParsedAddress(parsed) {
    if (!parsed) return;
    if (parsed.street) els.addrStreet.value = parsed.street;
    if (parsed.city)   els.addrCity.value   = parsed.city;
    if (parsed.state)  els.addrState.value  = parsed.state;
    if (parsed.zip)    els.addrZip.value    = parsed.zip;
  }

  function setAddressReadonly(locked) {
    if (els.fullAddress) {
      els.fullAddress.readOnly      = locked;
      els.fullAddress.style.opacity = locked ? "0.7" : "";
      els.fullAddress.style.cursor  = locked ? "default" : "";
    }
  }

  if (els.fullAddress) {
    els.fullAddress.addEventListener("input", () => {
      const val = els.fullAddress.value;
      const hasComma = val.includes(',');
      if (els.addressHint) els.addressHint.style.display = (val.length > 3 && !hasComma) ? "block" : "none";
      applyParsedAddress(parseFullAddress(val));
    });
  }

  const KPI_REQUIRED_FIELDS = {
    roi: ["propertyValue", "percentDownPct", "rateAprPct", "loanLengthYears", "estFixingCost", "monthsHold", "desiredARV", "taxesMonthly", "insuranceMonthly", "hoaMonthly"],
  };

  function setKpiHighlight(kpiKey, active) {
    const fields = KPI_REQUIRED_FIELDS[kpiKey] || [];
    fields.forEach(id => {
      const el = document.getElementById(id);
      const wrap = el?.closest(".input");
      if (wrap) wrap.classList.toggle("highlight-required", active);
    });
  }

  function renderKPIs(r) {
    const roiPct = isFinite(r.roi) ? (r.roi * 100).toFixed(2) + "%" : "N/A";
    const band = bandROI(r.roi);
    const tip = "ROI = (Desired ARV − Total Losses) / Total Losses";
    els.kpiBadges.innerHTML = `<div class="${kpiClass(band)}" title="${tip}" data-kpi="roi" style="cursor:default">ROI <span class="value">${roiPct}</span></div>`;

    els.kpiBadges.querySelectorAll("[data-kpi]").forEach(pill => {
      pill.addEventListener("mouseenter", () => setKpiHighlight(pill.dataset.kpi, true));
      pill.addEventListener("mouseleave", () => setKpiHighlight(pill.dataset.kpi, false));
    });
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
      { label: "Closing Costs (est.)", val: formatMoney(s.closingCosts), tip: "Closing = 5% of acquisition value (est.)" },
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

  // Save to Supabase
  els.addOrSaveBtn.addEventListener("click", async () => {
    const f = collectForm();
    const n = collectNums();

    if (!f.scenarioName.trim()) {
      showSaveError("Scenario name is required.");
      return;
    }
    const minimalOk = (+n.propertyValue > 0 && +n.percentDownPct >= 0 && +n.rateAprPct >= 0);
    if (!minimalOk) {
      showSaveError("Provide at least: Property Value, Percent Down, Rate.");
      return;
    }
    hideSaveError();

    const r = computeFRAT(n);
    const scenarioData = {
      module: 'FRAT',
      scenario_name: f.scenarioName.trim(),
      scenario_description: f.scenarioDescription.trim() || null,
      bedrooms_or_units: 0,
      calculate_per_bedroom: false,
      bedroom_details: null,
      inputs: {
        propertyValue:    +n.propertyValue,
        percentDownPct:   +n.percentDownPct,
        rateAprPct:       +n.rateAprPct,
        loanLengthYears:  +n.loanLengthYears,
        estFixingCost:    +n.estFixingCost,
        taxesAnnual:      round2(+n.taxesMonthly * 12),
        insuranceMonthly: +n.insuranceMonthly,
        hoaMonthly:       +n.hoaMonthly,
        monthsHold:       +n.monthsHold,
        desiredARV:       +n.desiredARV,
        interestOnly:     !!n.interestOnly,
        comments:         f.comments,
      },
      computed: {
        ownershipCostMonthly:      round2(r.supp.ownershipCostMonthly),
        operatingExpensesMonthly:  round2(r.supp.operatingExpensesMonthly),
        mortgageMonthly:           round2(r.supp.mortgageMonthly),
        netIncome:                 round2(r.netIncome),
        roi:                       r.roi,
        suggestedARV: {
          roi40: r.targets.arv40,
          roi30: r.targets.arv30,
          roi20: r.targets.arv20,
          roi10: r.targets.arv10,
        },
      },
      bands: { roi: bandROI(r.roi).label },
    };

    els.addOrSaveBtn.disabled = true;
    els.addOrSaveBtn.textContent = "Saving…";

    try {
      if (currentScenarioId) {
        await updateScenario(currentScenarioId, scenarioData);
        if (currentPropertyId) {
          await updatePropertyZillowLink(currentPropertyId, (els.link.value || "").trim() || null);
          if (currentProperty) currentProperty.zillow_link = (els.link.value || "").trim() || null;
          const fStreet = els.addrStreet.value.trim();
          const fCity   = els.addrCity.value.trim();
          const fState  = els.addrState.value.trim();
          const fZip    = els.addrZip.value.trim();
          const addrChanged =
            fStreet !== (currentProperty?.street ?? '') ||
            fCity   !== (currentProperty?.city   ?? '') ||
            fState  !== (currentProperty?.state  ?? '') ||
            fZip    !== (currentProperty?.zip    ?? '');
          if (addrChanged) {
            await updatePropertyAddress(currentPropertyId, { street: fStreet, city: fCity, state: fState, zip: fZip });
            if (currentProperty) {
              currentProperty.street = fStreet;
              currentProperty.city   = fCity;
              currentProperty.state  = fState;
              currentProperty.zip    = fZip;
            }
          }
        }
        showToast("Scenario saved.", "success");
        lastSavedSnapshot = JSON.stringify(collectForm());
        isDirty = false;
        // Refresh dropdown label (name may have changed)
        allScenarios = await fetchScenarios(_fratPropId);
        renderScenarioSelect(allScenarios);
        els.scenarioSelect.value = currentScenarioId;
      } else {
        if (!currentPropertyId) {
          const street = els.addrStreet.value.trim();
          const city   = els.addrCity.value.trim();
          const state  = els.addrState.value.trim();
          const zip    = els.addrZip.value.trim();
          if (!street) { showSaveError("Street address is required."); els.addOrSaveBtn.disabled = false; els.addOrSaveBtn.textContent = "Save Scenario"; return; }
          const link    = els.link.value.trim() || null;
          const newProp = await createProperty({ street, city, state, zip }, link);
          currentPropertyId = newProp.id;
          setAddressReadonly(true);
        }
        const { id } = await createScenario(currentPropertyId, scenarioData);
        currentScenarioId = id;
        showToast("Scenario saved.", "success");
        allScenarios = await fetchScenarios(currentPropertyId);
        renderScenarioSelect(allScenarios);
        els.scenarioSelect.value = id;
        els.scenarioActionsBar.style.display = "flex";
        const newUrl = new URL(location.href);
        newUrl.searchParams.set("propertyId", currentPropertyId);
        history.replaceState({}, "", newUrl.toString());
        els.scenarioBar.style.display = "flex";
        lastSavedSnapshot = JSON.stringify(collectForm());
      }
    } catch (err) {
      showSaveError(err.message || "Save failed.");
      els.addOrSaveBtn.disabled = false;
      els.addOrSaveBtn.textContent = currentScenarioId ? "Save Changes" : "Save Scenario";
      return;
    }

    els.addOrSaveBtn.disabled = (lastSavedSnapshot !== null && JSON.stringify(collectForm()) === lastSavedSnapshot);
    els.addOrSaveBtn.textContent = "Save Changes";
  });

  // Clear
  els.clearBtn.addEventListener("click", () => { clearFormForNew(); });

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
  const closing = pv > 0 ? Math.round(pv * 0.05) : 0; // FRAT closing = 5% of acquisition value
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

  function showSaveError(msg) {
    if (!els.saveError) return;
    els.saveError.textContent = msg;
    els.saveError.style.display = "block";
  }
  function hideSaveError() {
    if (!els.saveError) return;
    els.saveError.style.display = "none";
  }
});