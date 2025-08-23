// ===== Catalogue Page Logic =====
document.addEventListener("DOMContentLoaded", () => {
  const cards = document.getElementById("cards");
  const moduleFilter = document.getElementById("moduleFilter");
  const kpiFilter = document.getElementById("kpiFilter");
  const searchBox = document.getElementById("searchBox");
  const exportBtn = document.getElementById("exportBtn");
  const exportSelect = document.getElementById("exportSelect");
  const pinToggleBtn = document.getElementById("pinToggleBtn");
  const delBtn = document.getElementById("deleteSelectedBtn");

  function filteredProps() {
    const catalog = getCatalog();
    const q = (searchBox.value || "").toLowerCase().trim();
    const mod = moduleFilter.value;
    const kpi = kpiFilter.value;

    let props = catalog.properties || [];
    if (mod) props = props.filter(p => p.module === mod);
    if (kpi) props = props.filter(p => [p.bands?.cashOnCash, p.bands?.capRate, p.bands?.dscr].includes(kpi));
    if (q) {
      props = props.filter(p => {
        const a = parseAddress(p?.source?.address || "");
        return a.line1.toLowerCase().includes(q);
      });
    }
    return props;
  }

  function sortForDisplay(arr){
    return [...arr].sort((a,b)=>{
      if((b.pinned?1:0)!==(a.pinned?1:0)) return (b.pinned?1:0)-(a.pinned?1:0);
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
  }

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

  function render(){
    const props = sortForDisplay(filteredProps());

    if(props.length===0){
      cards.innerHTML = `<div class="card"><div class="small">No properties match your filters.</div></div>`;
      applyCompactModeIfNeeded();
      return;
    }

    cards.innerHTML = props.map(p => {
      const addr = parseAddress(p?.source?.address || "");
      const head = addr.line1 || "(No address)";

      const hasUnit = addr.line2 && /(?:apt|suite|ste|unit|#)/i.test(addr.line2);
      const line2 = hasUnit ? `<div class="small" style="opacity:.85">${addr.line2}</div>` : "";

      const cityStateZip = [addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
      const countryText = (addr.country && !/^(us|usa|united states)$/i.test(addr.country)) ? `, ${addr.country}` : "";
      const sub = cityStateZip || countryText ? `<div class="small" style="margin-top:2px">${cityStateZip}${countryText}</div>` : "";

      const link = p.source?.link ? `<a href="${p.source.link}" target="_blank">Listing</a>` : "<span class='small'>No link</span>";

      const coc = p.computed?.cashOnCash;
      const cap = p.computed?.capRate;
      const dscr = p.computed?.dscr;
      const bCoC = bandCoC(coc);
      const bCap = bandCapRate(cap);
      const bDSCR = bandDSCR(dscr);

      const pinBadge = p.pinned
        ? `<button class="badge good pinBadge" data-id="${p.id}" title="Click to unpin">Pinned</button>`
        : "";

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
              <div class="${badgeClass(bCoC)}">CoC ${isFinite(coc)? (coc*100).toFixed(2)+"%" : "N/A"}</div>
              <div class="${badgeClass(bCap)}">Cap ${isFinite(cap)? (cap*100).toFixed(2)+"%" : "N/A"}</div>
              <div class="${badgeClass(bDSCR)}">DSCR ${isFinite(dscr)? dscr.toFixed(2) : "N/A"}</div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="grid four">
            <div><div class="small">Property Value</div><div>${formatMoney(p.inputs.propertyValue)}</div></div>
            <div><div class="small">Down %</div><div>${(p.inputs.percentDownPct).toFixed(2)}%</div></div>
            <div><div class="small">Rate</div><div>${(p.inputs.rateAprPct).toFixed(2)}%</div></div>
            <div><div class="small">Units × Rent</div><div>${p.inputs.bedroomsOrUnits} × ${formatMoney(p.inputs.rentPerUnitMonthly)}</div></div>
          </div>
          <div class="divider"></div>
          <div class="row" style="justify-content:flex-end;gap:8px">
            <a class="btn" href="GRASP.html?edit=${p.id}">Edit</a>
          </div>
        </div>
      `;
    }).join("");

    applyCompactModeIfNeeded();
  }

  // Click Pinned badge to unpin
  cards.addEventListener("click", (e) => {
    const btn = e.target.closest(".pinBadge");
    if(!btn) return;
    const id = btn.dataset.id;
    const catalog = getCatalog();
    const idx = (catalog.properties||[]).findIndex(p => p.id === id);
    if (idx >= 0) {
      catalog.properties[idx].pinned = false;
      catalog.properties[idx].updatedAt = new Date().toISOString();
      saveCatalog(catalog);
      showToast("Property unpinned.", "success");
      render();
    }
  });

  // Filters & search
  moduleFilter.addEventListener("change", render);
  kpiFilter.addEventListener("change", render);
  searchBox.addEventListener("input", render);

  // Export
  exportBtn.addEventListener("click", () => {
    const catalog = getCatalog();
    let props = filteredProps();
    const which = exportSelect.value;
    if(which === "json"){
      const blob = new Blob([JSON.stringify({ schemaVersion: catalog.schemaVersion, properties: props }, null, 2)], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "pat_catalog.json"; a.click();
      URL.revokeObjectURL(url);
      showToast("Catalogue exported as JSON", "success");
    } else if(which === "pdf"){
      openPrintableCatalogue(props);
      showToast("PDF export opened in new window", "info");
    }
  });

  // Pin/Unpin selected
  pinToggleBtn.addEventListener("click", () => {
    const checks = [...document.querySelectorAll(".selectBox:checked")].map(cb => cb.dataset.id);
    if(checks.length===0){
      showToast("Select at least one property to pin/unpin.", "info", {title:"Nothing selected"});
      return;
    }
    const catalog = getCatalog();
    catalog.properties = (catalog.properties||[]).map(p => {
      if(!checks.includes(p.id)) return p;
      return { ...p, pinned: !p.pinned, updatedAt: new Date().toISOString() };
    });
    saveCatalog(catalog);
    showToast("Pinned state updated.", "success");
    render();
  });

  // Delete
  delBtn.addEventListener("click", async () => {
    const checks = [...document.querySelectorAll(".selectBox:checked")].map(cb => cb.dataset.id);
    if(checks.length===0){
      showToast("Select at least one property to delete.", "info", {title:"Nothing selected"});
      return;
    }
    const confirmed = await showConfirm({
      title:"Delete selected?",
      message:`Delete ${checks.length} propert${checks.length>1?"ies":"y"} permanently?`,
      okText:"Delete",
      cancelText:"Cancel"
    });
    if(!confirmed) return;
    const catalog = getCatalog();
    catalog.properties = (catalog.properties||[]).filter(p => !checks.includes(p.id));
    saveCatalog(catalog);
    showToast("Deleted selected properties.", "success");
    render();
  });

  window.addEventListener("resize", () => applyCompactModeIfNeeded());

  render();
});