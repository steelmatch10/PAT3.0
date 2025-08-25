// ===== Catalogue Page Logic =====
document.addEventListener("DOMContentLoaded", () => {
  const cards = document.getElementById("cards");
  const moduleFilter = document.getElementById("moduleFilter");
  const searchBox = document.getElementById("searchBox");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importModal = document.getElementById("importModal");
  const importFile = document.getElementById("importFile");
  const importText = document.getElementById("importText");
  const importCancel = document.getElementById("importCancel");
  const importConfirm = document.getElementById("importConfirm");
  const exportSelect = document.getElementById("exportSelect");
  const pinToggleBtn = document.getElementById("pinToggleBtn");
  const delBtn = document.getElementById("deleteSelectedBtn");
  // ===== Import Button Logic =====
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      importModal.style.display = "flex";
      importFile.value = "";
      importText.value = "";
    });
  }

  if (importCancel) {
    importCancel.addEventListener("click", () => {
      importModal.style.display = "none";
    });
  }

  if (importFile) {
    importFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        importText.value = ev.target.result;
      };
      reader.readAsText(file);
    });
  }

  if (importConfirm) {
    importConfirm.addEventListener("click", () => {
      let data;
      try {
        data = JSON.parse(importText.value);
      } catch {
        showToast("Invalid JSON format.", "error");
        return;
      }
      // Accept either {properties: [...]}, or just an array
      let props = Array.isArray(data) ? data : data.properties;
      if (!Array.isArray(props)) {
        showToast("No properties found in import.", "error");
        return;
      }
      // Merge into catalogue
      const catalog = getCatalog();
      let added = 0;
      props.forEach(p => {
        // Only add if not already present (by id)
        if (!catalog.properties.some(x => x.id === p.id)) {
          catalog.properties.push(p);
          added++;
        }
      });
      saveCatalog(catalog);
      showToast(`${added} properties imported.`, added ? "success" : "info");
      importModal.style.display = "none";
      render();
    });
  }

  function filteredProps() {
    const catalog = getCatalog();
    const q = (searchBox.value || "").toLowerCase().trim();
    const mod = moduleFilter.value;
    let props = catalog.properties || [];
    if (mod) props = props.filter(p => p.module === mod);
    if (q) {
      props = props.filter(p => {
        const a = parseAddress(p?.source?.address || "");
        return a.line1.toLowerCase().includes(q);
      });
    }
    return props;
  }

  function sortForDisplay(arr) {
    return [...arr].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
  }

  // Adjust compact mode & min card height based on viewport/controls height
  function applyCompactModeIfNeeded() {
    const controls = document.querySelector("section.card");
    const controlsH = controls ? controls.getBoundingClientRect().height : 120;

    const minH = Math.max(180, Math.round(1.5 * controlsH));
    document.documentElement.style.setProperty("--prop-min-h", `${minH}px`);

    const listH = document.body.getBoundingClientRect().height;
    const overflow = listH > window.innerHeight + 24;
    if (overflow) {
      document.body.classList.add("compact");
    } else {
      document.body.classList.remove("compact");
    }
  }

  function render() {
    const props = sortForDisplay(filteredProps());

    if (props.length === 0) {
      cards.innerHTML = `<div class="card"><div class="small">No properties match your filters.</div></div>`;
      applyCompactModeIfNeeded();
      return;
    }

    cards.innerHTML = props.map(p => {
      const addrRaw = p?.source?.address || "";
      const addr = parseAddress(addrRaw);
      const head = addr.line1 || "(No address)";

      // Everything after the first comma (if any)
      let sub = "";
      const idx = addrRaw.indexOf(",");
      if (idx !== -1 && idx + 1 < addrRaw.length) {
        sub = `<div class="small" style="margin-top:2px">${addrRaw.slice(idx + 1).trim()}</div>`;
      }

      const hasUnit = addr.line2 && /(?:apt|suite|ste|unit|#)/i.test(addr.line2);
      const line2 = hasUnit ? `<div class="small" style="opacity:.85">${addr.line2}</div>` : "";
      const link = p.source?.link ? `<a href="${p.source.link}" target="_blank">Listing</a>` : "<span class='small'>No link</span>";

      // ------- KPI badges per module -------
      let badgesHtml = "";
      if (p.module === "FRAT") {
        const roi = p.computed?.roi;
        const band = (function (v) {
          if (!isFinite(v)) return { label: "N/A" };
          if (v > 0.40) return { label: "Amazing" };
          if (v >= 0.30) return { label: "Great" };
          if (v >= 0.20) return { label: "Good" };
          if (v >= 0.10) return { label: "Okay" };
          if (v >= 0) return { label: "Bad" };
          return { label: "Negative" };
        })(roi);
        badgesHtml = `<div class="${badgeClass(band)}">ROI ${isFinite(roi) ? (roi * 100).toFixed(2) + "%" : "N/A"}</div>`;
      } else {
        const coc = p.computed?.cashOnCash;
        const cap = p.computed?.capRate;
        const dscr = p.computed?.dscr;
        const bCoC = bandCoC(coc);
        const bCap = bandCapRate(cap);
        const bDSCR = bandDSCR(dscr);
        badgesHtml = `
          <div class="${badgeClass(bCoC)}">CoC ${isFinite(coc) ? (coc * 100).toFixed(2) + "%" : "N/A"}</div>
          <div class="${badgeClass(bCap)}">Cap ${isFinite(cap) ? (cap * 100).toFixed(2) + "%" : "N/A"}</div>
          <div class="${badgeClass(bDSCR)}">DSCR ${isFinite(dscr) ? dscr.toFixed(2) : "N/A"}</div>
        `;
      }

      // ------- Details grid per module -------
      let detailsHtml = "";
      if (p.module === "FRAT") {
        const monthsHold = p.inputs?.monthsHold;
        const desiredARV = p.inputs?.desiredARV;
        const interestOnly = !!p.inputs?.interestOnly;
        const netIncome = p.computed?.netIncome;
        detailsHtml = `
          <div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;width:100%;gap:0;">
            <div style="flex:1;text-align:center;"><div class="small">Property Value</div><div>${formatMoney(p.inputs.propertyValue)}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Fixing Cost</div><div>${formatMoney(p.inputs.estFixingCost || 0)}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Months to Market</div><div>${isFinite(monthsHold) ? monthsHold : "N/A"}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Interest-Only First Year</div><div>${interestOnly ? "Yes" : "No"}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Desired ARV</div><div>${isFinite(desiredARV) ? formatMoney(desiredARV) : "N/A"}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Net Income</div><div>${isFinite(netIncome) ? formatMoney(netIncome) : "N/A"}</div></div>
          </div>
        `;
      } else {
        // Calculate Total Initial Investment
        const downPayment = Number(p.inputs.propertyValue) * (Number(p.inputs.percentDownPct) / 100);
        const closingCosts = Number(p.inputs.propertyValue) * 0.05;
        const improvementCost = Number(p.inputs.estImprovementCost) || 0;
        const totalInitial = downPayment + closingCosts + improvementCost;
        const grossRentMonthly = p.computed?.grossRentMonthly;
        const annualCashFlow = p.computed?.annualCashFlow;
        detailsHtml = `
          <div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;width:100%;gap:0;">
            <div style="flex:1;text-align:center;"><div class="small">Property Value</div><div>${formatMoney(p.inputs.propertyValue)}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Total Initial Investment</div><div>${formatMoney(totalInitial)}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Gross Rent (Monthly)</div><div>${isFinite(grossRentMonthly) ? formatMoney(grossRentMonthly) : "N/A"}</div></div>
            <div style="flex:1;text-align:center;"><div class="small">Annual Cash Flow</div><div>${isFinite(annualCashFlow) ? formatMoney(annualCashFlow) : "N/A"}</div></div>
          </div>
        `;
      }

      const pinBadge = p.pinned
        ? `<button class="badge good pinBadge" data-id="${p.id}" title="Click to unpin">Pinned</button>`
        : "";

      // ------- Card template -------
      return `
        <div class="card property-card">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div style="display:flex;gap:10px;align-items:center">
              <input type="checkbox" class="selectBox" data-id="${p.id}"/>
              <div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <div class="addr-head">${head}</div>
                  ${line2}
                  ${pinBadge}
                </div>
                ${sub}
                <div class="small" style="margin-top:4px">${link}</div>
                <div class="small">Module: ${p.module}</div>
                <div class="small">Updated: ${new Date(p.updatedAt || p.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div class="kpi-badges">
              ${badgesHtml}
            </div>
          </div>
          <div class="divider"></div>
          ${detailsHtml}
          <div class="divider"></div>
          <div class="row" style="justify-content:flex-end;gap:8px">
            <a class="btn" href="${p.module === 'FRAT' ? 'FRAT.html' : 'GRASP.html'}?edit=${p.id}">Edit</a>
          </div>
        </div>
      `;
    }).join("");

    applyCompactModeIfNeeded();
  }

  // Click Pinned badge to unpin
  cards.addEventListener("click", (e) => {
    const btn = e.target.closest(".pinBadge");
    if (!btn) return;
    const id = btn.dataset.id;
    const catalog = getCatalog();
    const idx = (catalog.properties || []).findIndex(p => p.id === id);
    if (idx >= 0) {
      catalog.properties[idx].pinned = false;
      // Do NOT update updatedAt when pinning/unpinning
      saveCatalog(catalog);
      showToast("Property unpinned.", "success");
      render();
    }
  });

  // Filters & search
  moduleFilter.addEventListener("change", render);
  searchBox.addEventListener("input", render);

  // Export
  exportBtn.addEventListener("click", () => {
    const catalog = getCatalog();
    let props = filteredProps();
    const which = exportSelect.value;
    if (which === "json") {
      const blob = new Blob([JSON.stringify({ schemaVersion: catalog.schemaVersion, properties: props }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "pat_catalog.json"; a.click();
      URL.revokeObjectURL(url);
      showToast("Catalogue exported as JSON", "success");
    } else if (which === "pdf") {
      openPrintableCatalogue(props);
      showToast("PDF export opened in new window", "info");
    }
  });

  // Pin/Unpin selected
  pinToggleBtn.addEventListener("click", () => {
    const checks = [...document.querySelectorAll(".selectBox:checked")].map(cb => cb.dataset.id);
    if (checks.length === 0) {
      showToast("Select at least one property to pin/unpin.", "info", { title: "Nothing selected" });
      return;
    }
    const catalog = getCatalog();
    catalog.properties = (catalog.properties || []).map(p => {
      if (!checks.includes(p.id)) return p;
      // Do NOT update updatedAt when pinning/unpinning
      return { ...p, pinned: !p.pinned };
    });
    saveCatalog(catalog);
    showToast("Pinned state updated.", "success");
    render();
  });

  // Delete
  delBtn.addEventListener("click", async () => {
    const checks = [...document.querySelectorAll(".selectBox:checked")].map(cb => cb.dataset.id);
    if (checks.length === 0) {
      showToast("Select at least one property to delete.", "info", { title: "Nothing selected" });
      return;
    }
    const confirmed = await showConfirm({
      title: "Delete selected?",
      message: `Delete ${checks.length} propert${checks.length > 1 ? "ies" : "y"} permanently?`,
      okText: "Delete",
      cancelText: "Cancel"
    });
    if (!confirmed) return;
    const catalog = getCatalog();
    catalog.properties = (catalog.properties || []).filter(p => !checks.includes(p.id));
    saveCatalog(catalog);
    showToast("Deleted selected properties.", "success");
    render();
  });

  window.addEventListener("resize", () => applyCompactModeIfNeeded());

  render();
});