/* GRASP page behavior — Supabase-integrated */
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

  document.getElementById("logoutBtn").addEventListener("click", patSignOut);
  initProfileWidget(user, member);

  // ── URL params ────────────────────────────────────────────────────────────────
  const params     = new URLSearchParams(location.search);
  const propertyId = params.get("propertyId");   // existing property context
  const newScenario = params.get("newScenario");  // "1" = open blank new-scenario form

  // ── Element refs ─────────────────────────────────────────────────────────────
  const els = {
    scenarioName:        document.getElementById("scenarioName"),
    scenarioDescription: document.getElementById("scenarioDescription"),
    address:             document.getElementById("address"),
    link:                document.getElementById("link"),
    propertyValue:       document.getElementById("propertyValue"),
    percentDownPct:      document.getElementById("percentDownPct"),
    rateAprPct:          document.getElementById("rateAprPct"),
    loanLengthYears:     document.getElementById("loanLengthYears"),
    estImprovementCost:  document.getElementById("estImprovementCost"),
    closingCosts:        document.getElementById("closingCosts"),
    miscRateAnnual:      document.getElementById("miscRateAnnual"),
    taxesMonthly:        document.getElementById("taxesMonthly"),  // display field for tax (annual or monthly)
    insuranceMonthly:    document.getElementById("insuranceMonthly"),
    hoaMonthly:          document.getElementById("hoaMonthly"),
    units:               document.getElementById("units"),
    rentPerUnitMonthly:  document.getElementById("rentPerUnitMonthly"),
    calculatePerBedroom: document.getElementById("calculatePerBedroom"),
    perBedroomSection:   document.getElementById("perBedroomSection"),
    bedroomTableBody:    document.getElementById("bedroomTableBody"),
    avgRentAutofill:     document.getElementById("avgRentAutofill"),
    autofillBtn:         document.getElementById("autofillBtn"),
    avgRentGroup:        document.getElementById("avgRentGroup"),
    addOrSaveBtn:        document.getElementById("addOrSaveBtn"),
    clearBtn:            document.getElementById("clearBtn"),
    saveError:           document.getElementById("saveError"),
    viewModeToggle:      document.getElementById("viewModeToggle"),
    viewModeLabel:       document.getElementById("viewModeLabel"),
    taxesLabel:          document.getElementById("taxesLabel"),
    insuranceLabel:      document.getElementById("insuranceLabel"),
    hoaLabel:            document.getElementById("hoaLabel"),
    kpiBadges:           document.getElementById("kpiBadges"),
    supplemental:        document.getElementById("supplemental"),
    dscrGuide:           document.getElementById("dscrGuide"),
    suggestedRentCoc:    document.getElementById("suggestedRentCoc"),
    suggestedRentCap:    document.getElementById("suggestedRentCap"),
    moreDetails:         document.getElementById("moreDetails"),
    scenarioBar:         document.getElementById("scenarioBar"),
    scenarioSelect:      document.getElementById("scenarioSelect"),
    newScenarioBtn:      document.getElementById("newScenarioBtn"),
    scenarioActionsBar:  document.getElementById("scenarioActionsBar"),
    archiveScenarioBtn:  document.getElementById("archiveScenarioBtn"),
    archivedBadge:       document.getElementById("archivedBadge"),
  };

  // ── Access check — investor read-only enforcement ────────────────────────────
  let readOnly = false;
  if (!founder && propertyId) {
    const approvedIds = await fetchApprovedPropertyIds();
    if (!approvedIds.has(propertyId)) {
      readOnly = true;
      document.getElementById("readOnlyBanner").style.display = "block";
      document.querySelectorAll("#mainContent input, #mainContent select, #mainContent textarea").forEach(el => {
        el.disabled = true;
      });
      els.addOrSaveBtn.style.display  = "none";
      els.clearBtn.style.display      = "none";
      els.newScenarioBtn.style.display = "none";
      els.archiveScenarioBtn.style.display = "none";
    }
  }

  // ── State ────────────────────────────────────────────────────────────────────
  let currentScenarioId = null;   // null = new scenario
  let currentPropertyId = propertyId || null;
  let cachedBedroomDetails = [];  // preserved when toggle is turned off

  // ── View mode (monthly|annual) — persisted to localStorage (UX pref) ─────────
  function getCarryMode() { return document.body.dataset.carryMode === "annual" ? "annual" : "monthly"; }
  function setCarryMode(mode) { document.body.dataset.carryMode = mode === "annual" ? "annual" : "monthly"; }

  {
    const saved = readViewMode();
    const startMode = saved === "annual" ? "annual" : "monthly";
    setCarryMode(startMode);
    if (els.viewModeToggle) els.viewModeToggle.checked = startMode === "annual";
    if (els.viewModeLabel) els.viewModeLabel.textContent = startMode === "annual" ? "Annual view" : "Monthly view";
    setCarryCostLabels(startMode);
  }

  els.viewModeToggle.addEventListener("change", (e) => {
    const toMode = e.target.checked ? "annual" : "monthly";
    const fromMode = getCarryMode();
    if (toMode !== fromMode) {
      const current = {
        taxesMonthly:     els.taxesMonthly.value,
        insuranceMonthly: els.insuranceMonthly.value,
        hoaMonthly:       els.hoaMonthly.value,
      };
      const converted = convertCarryCosts(current, fromMode, toMode);
      els.taxesMonthly.value     = converted.taxesMonthly;
      els.insuranceMonthly.value = converted.insuranceMonthly;
      els.hoaMonthly.value       = converted.hoaMonthly;
      setCarryMode(toMode);
      saveViewMode(toMode);
    }
    if (els.viewModeLabel) els.viewModeLabel.textContent = toMode === "annual" ? "Annual view" : "Monthly view";
    setCarryCostLabels(toMode);
    triggerCompute();
  });

  // ── More details toggle ───────────────────────────────────────────────────────
  if (els.moreDetails) {
    const summary = els.moreDetails.querySelector("summary");
    const syncLabel = () => { summary.textContent = els.moreDetails.open ? "Show less" : "Show more"; };
    els.moreDetails.addEventListener("toggle", syncLabel);
    setTimeout(() => syncLabel(), 0);
  }

  // ── Bedroom toggle ────────────────────────────────────────────────────────────
  els.calculatePerBedroom.addEventListener("change", () => {
    const on = els.calculatePerBedroom.checked;
    if (on) {
      els.perBedroomSection.classList.add("visible");
      els.avgRentGroup.style.display = "none";
      rebuildBedroomTable(parseInt(els.units.value || "0", 10));
    } else {
      // Cache current bedroom details before hiding
      cachedBedroomDetails = collectBedroomDetails();
      els.perBedroomSection.classList.remove("visible");
      els.avgRentGroup.style.display = "";
    }
    triggerCompute();
  });

  // Rebuild table when unit count changes (while per-bedroom is on)
  els.units.addEventListener("input", () => {
    if (els.calculatePerBedroom.checked) {
      rebuildBedroomTable(parseInt(els.units.value || "0", 10));
    }
    triggerCompute();
  });

  // Auto-fill button
  els.autofillBtn.addEventListener("click", () => {
    const avgRent = parseFloat(els.avgRentAutofill.value) || 0;
    document.querySelectorAll(".bedroom-rent-input").forEach(inp => { inp.value = avgRent || ""; });
    triggerCompute();
  });

  // Recompute when any bedroom rent changes
  document.getElementById("bedroomTableBody").addEventListener("input", (e) => {
    if (e.target.classList.contains("bedroom-rent-input")) triggerCompute();
  });

  // ── Scenario selector (when propertyId is in URL) ────────────────────────────
  let allScenarios = [];
  let currentProperty = null;

  if (propertyId) {
    els.scenarioBar.style.display = "flex";
    [allScenarios, currentProperty] = await Promise.all([
      fetchScenarios(propertyId),
      fetchProperty(propertyId),
    ]);

    renderScenarioSelect(allScenarios);

    if (allScenarios.length > 0 && !newScenario) {
      // Load the most recent scenario
      loadScenarioIntoForm(allScenarios[0]);
    } else {
      // New scenario: pre-populate property address/link (taxes blank since no prior scenario)
      clearFormForNew({
        address: currentProperty?.address    ?? "",
        link:    currentProperty?.zillow_link ?? "",
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
        address:      currentProperty?.address   ?? "",
        link:         currentProperty?.zillow_link ?? "",
        taxesAnnual:  lastTaxesAnnual,
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
        // Refresh list
        allScenarios = await fetchScenarios(propertyId);
        renderScenarioSelect(allScenarios);
        if (allScenarios.length > 0) loadScenarioIntoForm(allScenarios[0]);
        else clearFormForNew();
      } catch (err) {
        showSaveError(err.message || "Failed to archive scenario.");
      }
    });

    // Show/hide archive button based on permissions
    if (founder || member?.global_role === "investor") {
      els.scenarioActionsBar.style.display = "none"; // shown when a scenario is loaded
    }
  } else {
    // No propertyId — standalone "add new" mode (fallback; user should come from index.html)
    clearFormForNew();
  }

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  const allInputIds = [
    "scenarioName", "scenarioDescription", "address", "link", "propertyValue", "percentDownPct",
    "rateAprPct", "loanLengthYears", "estImprovementCost", "closingCosts", "miscRateAnnual",
    "taxesMonthly", "insuranceMonthly", "hoaMonthly", "units", "rentPerUnitMonthly",
  ];
  allInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => triggerCompute());
    el.addEventListener("change", () => triggerCompute());
  });

  // ── Save button ───────────────────────────────────────────────────────────────
  els.addOrSaveBtn.addEventListener("click", async () => {
    hideSaveError();
    const normalized = collectFormNormalized();

    // Validation
    if (!normalized.scenarioName.trim()) { showSaveError("Scenario name is required."); return; }
    if (!normalized.propertyValue || normalized.propertyValue <= 0) { showSaveError("Property value is required."); return; }
    if (!normalized.bedroomsOrUnits || normalized.bedroomsOrUnits <= 0) { showSaveError("Bedrooms/Units is required."); return; }

    const calcPerBed = els.calculatePerBedroom.checked;
    if (calcPerBed) {
      const details = collectBedroomDetails();
      if (details.length !== normalized.bedroomsOrUnits) {
        showSaveError(`Bedroom table must have ${normalized.bedroomsOrUnits} rows. Add or remove bedrooms first.`);
        return;
      }
    }

    // Build inputs JSONB
    const inputs = {
      propertyValue:     normalized.propertyValue,
      percentDownPct:    normalized.percentDownPct,
      rateAprPct:        normalized.rateAprPct,
      loanLengthYears:   normalized.loanLengthYears,
      taxesAnnual:       normalized.taxesAnnual,
      insuranceMonthly:  normalized.insuranceMonthly,
      hoaMonthly:        normalized.hoaMonthly,
      estImprovementCost: normalized.estImprovementCost,
      closingCosts:      normalized.closingCosts,
      miscRateAnnual:    normalized.miscRateAnnual,
    };

    // Compute KPIs (computeAll expects taxesMonthly)
    const kpiResult = computeAll({
      propertyValue:     inputs.propertyValue,
      percentDownPct:    inputs.percentDownPct,
      rateAprPct:        inputs.rateAprPct,
      loanLengthYears:   inputs.loanLengthYears,
      taxesMonthly:      inputs.taxesAnnual / 12,
      insuranceMonthly:  inputs.insuranceMonthly,
      hoaMonthly:        inputs.hoaMonthly,
      estImprovementCost: inputs.estImprovementCost,
      bedroomsOrUnits:   normalized.bedroomsOrUnits,
      rentPerUnitMonthly: normalized.rentPerUnitMonthly,
    });

    // Rename suggestedRentPerUnit → suggestedGrossRent for v2 schema
    const computed = { ...kpiResult.computed };
    computed.suggestedGrossRent = computed.suggestedRentPerUnit;
    delete computed.suggestedRentPerUnit;

    const bands = {
      capRate:   kpiResult.bands.capRate.label,
      cashOnCash: kpiResult.bands.cashOnCash.label,
      dscr:      kpiResult.bands.dscr.label,
    };

    const bedroomDetails = calcPerBed ? collectBedroomDetails() : null;

    const scenarioData = {
      scenario_name:        normalized.scenarioName.trim(),
      scenario_description: normalized.scenarioDescription.trim() || null,
      bedrooms_or_units:    normalized.bedroomsOrUnits,
      calculate_per_bedroom: calcPerBed,
      inputs,
      computed,
      bands,
      bedroom_details: bedroomDetails,
    };

    els.addOrSaveBtn.disabled = true;
    els.addOrSaveBtn.textContent = "Saving…";

    try {
      if (currentScenarioId) {
        await updateScenario(currentScenarioId, scenarioData);
        showToast("Scenario updated.", "success");
      } else {
        if (!currentPropertyId) {
          // Create property first from address
          if (!normalized.address.trim()) { showSaveError("Property address is required when no property is selected."); return; }
          const prop = await createProperty(normalized.address.trim(), normalized.link.trim() || null);
          currentPropertyId = prop.id;
        }
        const { id } = await createScenario(currentPropertyId, scenarioData);
        currentScenarioId = id;
        showToast("Scenario saved.", "success");
        // Refresh scenario list
        allScenarios = await fetchScenarios(currentPropertyId);
        renderScenarioSelect(allScenarios);
        els.scenarioSelect.value = id;
        els.scenarioActionsBar.style.display = "flex";
        // Update URL without reload
        const newUrl = new URL(location.href);
        newUrl.searchParams.set("propertyId", currentPropertyId);
        history.replaceState({}, "", newUrl.toString());
        els.scenarioBar.style.display = "flex";
      }
    } catch (err) {
      showSaveError(err.message || "Failed to save scenario.");
    }

    els.addOrSaveBtn.disabled = false;
    els.addOrSaveBtn.textContent = "Save Scenario";
  });

  // Clear
  els.clearBtn.addEventListener("click", () => {
    clearFormForNew();
    showToast("Inputs cleared.", "info");
  });

  // Initial compute
  triggerCompute();

  // ── Form helpers ──────────────────────────────────────────────────────────────

  function clearFormForNew(defaults = {}) {
    currentScenarioId = null;
    els.scenarioName.value        = "";
    els.scenarioDescription.value = "";
    els.address.value             = defaults.address ?? "";
    els.link.value                = defaults.link    ?? "";
    els.propertyValue.value       = "";
    els.percentDownPct.value      = "";
    els.rateAprPct.value          = "";
    els.loanLengthYears.value     = "30";
    els.estImprovementCost.value  = "";
    els.closingCosts.value        = "15000";
    els.miscRateAnnual.value      = "1";
    // Taxes: carry from previous scenario if provided, converted to display mode
    if (defaults.taxesAnnual != null) {
      const mode = getCarryMode();
      els.taxesMonthly.value = mode === "annual" ? defaults.taxesAnnual : round2(defaults.taxesAnnual / 12);
    } else {
      els.taxesMonthly.value = "";
    }
    els.insuranceMonthly.value    = "";
    els.hoaMonthly.value          = "";
    els.units.value               = "";
    els.rentPerUnitMonthly.value  = "";
    els.calculatePerBedroom.checked = false;
    els.perBedroomSection.classList.remove("visible");
    els.avgRentGroup.style.display = "";
    cachedBedroomDetails = [];
    els.archivedBadge.style.display = "none";
    hideSaveError();
    triggerCompute();
  }

  /**
   * Populate form from a Supabase scenario record.
   * Taxes are stored as taxesAnnual; convert for display based on current view mode.
   */
  function loadScenarioIntoForm(scenario) {
    currentScenarioId = scenario.id;
    const inp = scenario.inputs || {};
    const mode = getCarryMode();

    els.scenarioName.value        = scenario.scenario_name || "";
    els.scenarioDescription.value = scenario.scenario_description || "";
    els.address.value             = "";  // address lives on property, not shown here yet
    els.link.value                = "";
    els.propertyValue.value       = inp.propertyValue ?? "";
    els.percentDownPct.value      = inp.percentDownPct ?? "";
    els.rateAprPct.value          = inp.rateAprPct ?? "";
    els.loanLengthYears.value     = inp.loanLengthYears ?? 30;
    els.estImprovementCost.value  = inp.estImprovementCost ?? "";
    els.closingCosts.value        = inp.closingCosts ?? 15000;
    els.miscRateAnnual.value      = inp.miscRateAnnual != null ? (inp.miscRateAnnual * 100).toFixed(2) : "1";

    // Taxes: stored as taxesAnnual; display in current mode
    const taxesAnnual = inp.taxesAnnual ?? 0;
    els.taxesMonthly.value = mode === "annual" ? taxesAnnual : round2(taxesAnnual / 12);

    // Insurance/HOA stored monthly — convert if in annual view
    const insM = inp.insuranceMonthly ?? 0;
    const hoaM = inp.hoaMonthly ?? 0;
    els.insuranceMonthly.value = mode === "annual" ? round2(insM * 12) : insM;
    els.hoaMonthly.value       = mode === "annual" ? round2(hoaM * 12) : hoaM;

    els.units.value = scenario.bedrooms_or_units ?? "";

    const calcPerBed = scenario.calculate_per_bedroom || false;
    els.calculatePerBedroom.checked = calcPerBed;

    if (calcPerBed && scenario.bedroom_details?.length) {
      cachedBedroomDetails = scenario.bedroom_details;
      els.perBedroomSection.classList.add("visible");
      els.avgRentGroup.style.display = "none";
      rebuildBedroomTable(scenario.bedrooms_or_units, scenario.bedroom_details);
      // derive avg rent from bedroom details
      const total = scenario.bedroom_details.reduce((s, b) => s + (b.bedroomRent || 0), 0);
      els.rentPerUnitMonthly.value = scenario.bedrooms_or_units > 0 ? round2(total / scenario.bedrooms_or_units) : "";
    } else {
      els.perBedroomSection.classList.remove("visible");
      els.avgRentGroup.style.display = "";
      // Gross rent is stored in computed; reverse-engineer rentPerUnit
      const computed = scenario.computed || {};
      const grossRent = computed.grossRentMonthly || 0;
      const beds = scenario.bedrooms_or_units || 1;
      els.rentPerUnitMonthly.value = beds > 0 ? round2(grossRent / beds) : "";
    }

    // Archive state
    if (scenario.archived_at) {
      els.archivedBadge.style.display = "inline";
      els.archiveScenarioBtn.style.display = "none";
    } else {
      els.archivedBadge.style.display = "none";
      if (!readOnly) {
        els.archiveScenarioBtn.style.display = "";
        els.scenarioActionsBar.style.display = "flex";
      }
    }

    hideSaveError();
    triggerCompute();
  }

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

  /** Build/rebuild the bedroom breakdown table. Reuses existing values when possible. */
  function rebuildBedroomTable(n, existingDetails) {
    const tbody = els.bedroomTableBody;
    tbody.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const existing = existingDetails?.find(d => d.bedroomIndex === i)
                    || cachedBedroomDetails?.find(d => d.bedroomIndex === i);
      const desc = existing?.bedroomDesc || `Bedroom ${i}`;
      const rent = existing?.bedroomRent ?? "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i}</td>
        <td><input type="text" class="bedroom-desc-input" data-index="${i}" value="${desc}"></td>
        <td><input type="number" class="bedroom-rent-input" data-index="${i}" min="0" step="1" value="${rent}" placeholder="0"></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function collectBedroomDetails() {
    const rows = document.querySelectorAll("#bedroomTableBody tr");
    return Array.from(rows).map(tr => ({
      bedroomIndex: parseInt(tr.querySelector(".bedroom-rent-input").dataset.index, 10),
      bedroomDesc:  tr.querySelector(".bedroom-desc-input").value.trim(),
      bedroomRent:  parseFloat(tr.querySelector(".bedroom-rent-input").value) || 0,
    }));
  }

  /**
   * Collect form into a normalized object where taxes/insurance/HOA are MONTHLY.
   * taxesAnnual is also returned for JSONB storage.
   */
  function collectFormNormalized() {
    const mode = getCarryMode();
    const taxDisplay   = parseFloat(els.taxesMonthly.value) || 0;
    const insDisplay   = parseFloat(els.insuranceMonthly.value) || 0;
    const hoaDisplay   = parseFloat(els.hoaMonthly.value) || 0;

    const taxesAnnual      = mode === "annual" ? taxDisplay : round2(taxDisplay * 12);
    const insuranceMonthly = mode === "annual" ? round2(insDisplay / 12) : insDisplay;
    const hoaMonthly       = mode === "annual" ? round2(hoaDisplay / 12) : hoaDisplay;

    const calcPerBed = els.calculatePerBedroom.checked;
    let rentPerUnitMonthly = parseFloat(els.rentPerUnitMonthly.value) || 0;
    if (calcPerBed) {
      const details = collectBedroomDetails();
      const total = details.reduce((s, b) => s + (b.bedroomRent || 0), 0);
      const beds = parseInt(els.units.value || "0", 10) || 1;
      rentPerUnitMonthly = round2(total / beds);
    }

    const miscRateDecimal = (parseFloat(els.miscRateAnnual.value) || 1) / 100;

    return {
      scenarioName:        els.scenarioName.value || "",
      scenarioDescription: els.scenarioDescription.value || "",
      address:             els.address.value || "",
      link:                els.link.value || "",
      propertyValue:       parseFloat(els.propertyValue.value) || 0,
      percentDownPct:      parseFloat(els.percentDownPct.value) || 0,
      rateAprPct:          parseFloat(els.rateAprPct.value) || 0,
      loanLengthYears:     parseFloat(els.loanLengthYears.value) || 30,
      estImprovementCost:  parseFloat(els.estImprovementCost.value) || 0,
      closingCosts:        parseFloat(els.closingCosts.value) || 15000,
      miscRateAnnual:      miscRateDecimal,
      taxesAnnual,
      insuranceMonthly,
      hoaMonthly,
      bedroomsOrUnits:     parseInt(els.units.value || "0", 10) || 0,
      rentPerUnitMonthly,
    };
  }

  // ── KPI computation & rendering ───────────────────────────────────────────────

  function triggerCompute() {
    const f = collectFormNormalized();
    const kpi = computeAll({
      propertyValue:     f.propertyValue,
      percentDownPct:    f.percentDownPct,
      rateAprPct:        f.rateAprPct,
      loanLengthYears:   f.loanLengthYears,
      taxesMonthly:      f.taxesAnnual / 12,
      insuranceMonthly:  f.insuranceMonthly,
      hoaMonthly:        f.hoaMonthly,
      estImprovementCost: f.estImprovementCost,
      bedroomsOrUnits:   f.bedroomsOrUnits,
      rentPerUnitMonthly: f.rentPerUnitMonthly,
    });

    renderKPIs(kpi);
    renderDSCRGuide(kpi);
    renderSuggestedRent(kpi);
    renderSupplemental(kpi, f);
  }

  function renderKPIs(k) {
    const cap  = k.computed.capRate;
    const coc  = k.computed.cashOnCash;
    const dscr = k.computed.dscr;
    const tipCap  = "Cap = NOI / Property Value (NOI = (Gross − OpEx) × 12)";
    const tipCoC  = "CoC = Annual Cash Flow / Total Initial Investment";
    const tipDSCR = "DSCR = NOI / Annual Debt Service (Mortgage × 12)";
    els.kpiBadges.innerHTML = `
      <div class="${kpiClass(k.bands.cashOnCash)}" title="${tipCoC}">CoC <span class="value"> ${isFinite(coc) ? formatPct(coc) : "N/A"}</span></div>
      <div class="${kpiClass(k.bands.capRate)}" title="${tipCap}">Cap Rate <span class="value"> ${isFinite(cap) ? formatPct(cap) : "N/A"}</span></div>
      <div class="${kpiClass(k.bands.dscr)}" title="${tipDSCR}">DSCR <span class="value"> ${isFinite(dscr) ? dscr.toFixed(2) : "N/A"}</span></div>
    `;
  }

  function renderDSCRGuide(k) {
    const g = k.computed.dscrGuidance;
    els.dscrGuide.innerHTML = `
      <div class="card"><div class="small">DSCR ${CONSTANTS.DSCR_TARGETS[0]} Price</div><div style="font-weight:800;font-size:18px">${isFinite(g.priceForDSCR1_5) ? formatMoney(g.priceForDSCR1_5) : "N/A"}</div></div>
      <div class="card"><div class="small">DSCR ${CONSTANTS.DSCR_TARGETS[1]} Price</div><div style="font-weight:800;font-size:18px">${isFinite(g.priceForDSCR1_2) ? formatMoney(g.priceForDSCR1_2) : "N/A"}</div></div>
    `;
  }

  function renderSuggestedRent(k) {
    const s = k.computed.suggestedRentPerUnit;
    const cell = (v) => isFinite(v) ? formatMoney(v) : "N/A";
    const [coc1, coc2, coc3] = CONSTANTS.COC_BANDS.map(v => (v * 100).toFixed(0) + "%");
    const [cap1, cap2, cap3] = CONSTANTS.CAP_RATE_BANDS.map(v => (v * 100).toFixed(0) + "%");
    els.suggestedRentCoc.innerHTML = `
      <tr><td>CoC ${coc1}</td><td>${cell(s.coc.pct7)}</td></tr>
      <tr><td>CoC ${coc2}</td><td>${cell(s.coc.pct5)}</td></tr>
      <tr><td>CoC ${coc3}</td><td>${cell(s.coc.pct3)}</td></tr>
    `;
    els.suggestedRentCap.innerHTML = `
      <tr><td>Cap ${cap1}</td><td>${cell(s.cap.pct12)}</td></tr>
      <tr><td>Cap ${cap2}</td><td>${cell(s.cap.pct8)}</td></tr>
      <tr><td>Cap ${cap3}</td><td>${cell(s.cap.pct5)}</td></tr>
    `;
  }

  function renderSupplemental(k, f) {
    const c = k.computed;
    const n = k.inputsNormalized;
    const totalInitial = n.downPayment + n.closingCosts + (f.estImprovementCost || 0);
    const rows = [
      { label: "Down Payment",               val: formatMoney(n.downPayment),               tip: "Down = Property Value × Percent Down" },
      { label: "Closing Costs",              val: formatMoney(n.closingCosts),              tip: `Closing = $${(f.closingCosts || 15000).toLocaleString()} (editable per scenario)` },
      { label: "Estimated Improvement Cost", val: formatMoney(f.estImprovementCost || 0),  tip: "As entered" },
      { label: "Total Initial Investment",   val: formatMoney(totalInitial),                tip: "Down + Closing + Improvements" },
      { label: "Loan Amount",                val: formatMoney(n.loanAmount),               tip: "Loan = Property Value − Down Payment" },
      { label: "Mortgage (Monthly)",         val: formatMoney(c.mortgageMonthly),          tip: "PMT = r·L / (1 − (1+r)^−n)" },
      { label: "Ownership Cost (Monthly)",   val: formatMoney(c.ownershipCostMonthly),     tip: "Ownership = OpEx + Mortgage" },
      { label: "Operating Expenses (Monthly)", val: formatMoney(c.operatingExpensesMonthly), tip: "OpEx = Taxes + Insurance + HOA + Misc" },
      { label: "Gross Rent (Monthly)",       val: formatMoney(c.grossRentMonthly),         tip: "Gross = Units × Rent/Unit" },
      { label: "NOI (Annual)",               val: formatMoney(c.noiAnnual),                tip: "NOI = (Gross − OpEx) × 12" },
      { label: "Annual Cash Flow",           val: formatMoney(c.annualCashFlow),           tip: "CF = (Gross − OpEx − Mortgage) × 12" },
      { label: "Misc (Monthly)",             val: formatMoney(n.miscMonthly),              tip: `Misc = Property Value × ${((f.miscRateAnnual || 0.01) * 100).toFixed(1)}%/yr ÷ 12` },
    ];
    els.supplemental.innerHTML = rows.map(r =>
      `<div class="row" style="justify-content:space-between" title="${r.tip}">
         <div class="small">${r.label}</div><div>${r.val}</div>
       </div>`
    ).join("");
  }

  // ── Error display ─────────────────────────────────────────────────────────────
  function showSaveError(msg) {
    els.saveError.textContent = msg;
    els.saveError.style.display = "block";
  }
  function hideSaveError() {
    els.saveError.style.display = "none";
  }
});
