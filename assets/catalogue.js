// ===== Catalogue Page Logic =====
document.addEventListener("DOMContentLoaded", () => {
  const cards = document.getElementById("cards");
  const moduleFilter = document.getElementById("moduleFilter");
  const kpiFilter = document.getElementById("kpiFilter");
  const searchBox = document.getElementById("searchBox");
  const exportBtn = document.getElementById("exportBtn");
  const exportSelect = document.getElementById("exportSelect");
  const pinBtn = document.getElementById("pinSelectedBtn");
  const delBtn = document.getElementById("deleteSelectedBtn");

  function sortForDisplay(arr){
    return [...arr].sort((a,b)=>{
      if((b.pinned?1:0)!==(a.pinned?1:0)) return (b.pinned?1:0)-(a.pinned?1:0);
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
  }

  function render(){
    const catalog = getCatalog();
    const q = (searchBox.value || "").toLowerCase().trim();
    let props = catalog.properties || [];
    const mod = moduleFilter.value;
    const kpi = kpiFilter.value;

    if(mod) props = props.filter(p => p.module === mod);
    if(kpi){
      props = props.filter(p => [p.bands?.cashOnCash, p.bands?.capRate, p.bands?.dscr].includes(kpi));
    }
    if(q){
      props = props.filter(p => {
        const a = parseAddress(p?.source?.address || "");
        return (a.line1.toLowerCase().includes(q));
      });
    }

    props = sortForDisplay(props);

    if(props.length===0){
      cards.innerHTML = `<div class="card"><div class="small">No properties match your filters.</div></div>`;
      return;
    }

    cards.innerHTML = props.map(p => {
      const addr = parseAddress(p?.source?.address || "");
      const head = addr.line1 || "(No address)";
      const line2 = addr.line2 ? `<div class="small" style="opacity:.85">${addr.line2}</div>` : "";
      const cityRow = [addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
      const sub = cityRow ? `<div class="small" style="margin-top:2px">${cityRow}</div>` : "";
      const link = p.source?.link ? `<a href="${p.source.link}" target="_blank">Listing</a>` : "<span class='small'>No link</span>";

      const coc = p.computed?.cashOnCash;
      const cap = p.computed?.capRate;
      const dscr = p.computed?.dscr;
      const bCoC = bandCoC(coc);
      const bCap = bandCapRate(cap);
      const bDSCR = bandDSCR(dscr);
      const pinBadge = p.pinned ? `<span class="badge good">Pinned</span>` : "";

      return `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <input type="checkbox" class="selectBox" data-id="${p.id}" style="margin-top:4px"/>
              <div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <div style="font-weight:800;font-size:18px">${head}</div>
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
  }

  // Filters & search
  moduleFilter.addEventListener("change", render);
  kpiFilter.addEventListener("change", render);
  searchBox.addEventListener("input", render);

  // Export
  exportBtn.addEventListener("click", () => {
    const catalog = getCatalog();
    // Reuse filtering before export
    const q = (searchBox.value || "").toLowerCase().trim();
    const mod = moduleFilter.value;
    const kpi = kpiFilter.value;
    let props = catalog.properties || [];
    if(mod) props = props.filter(p => p.module === mod);
    if(kpi) props = props.filter(p => [p.bands?.cashOnCash, p.bands?.capRate, p.bands?.dscr].includes(kpi));
    if(q) props = props.filter(p => parseAddress(p?.source?.address||"").line1.toLowerCase().includes(q));

    const which = exportSelect.value;
    if(which === "json"){
      const blob = new Blob([JSON.stringify({ schemaVersion: catalog.schemaVersion, properties: props }, null, 2)], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "pat_catalog.json"; a.click();
      URL.revokeObjectURL(url);
    } else if(which === "pdf"){
      openPrintableCatalogue(props); // print dialog → Save as PDF
    }
  });

  // Pin / Delete
  pinBtn.addEventListener("click", () => {
    const catalog = getCatalog();
    const checks = [...document.querySelectorAll(".selectBox:checked")].map(cb => cb.dataset.id);
    if(checks.length===0){ alert("Select at least one property to pin."); return; }
    catalog.properties = (catalog.properties||[]).map(p => checks.includes(p.id) ? ({...p, pinned:true, updatedAt: new Date().toISOString()}) : p);
    saveCatalog(catalog);
    render();
  });

  delBtn.addEventListener("click", () => {
    const checks = [...document.querySelectorAll(".selectBox:checked")].map(cb => cb.dataset.id);
    if(checks.length===0){ alert("Select at least one property to delete."); return; }
    if(!confirm(`Delete ${checks.length} selected propert${checks.length>1?"ies":"y"}?`)) return;
    const catalog = getCatalog();
    catalog.properties = (catalog.properties||[]).filter(p => !checks.includes(p.id));
    saveCatalog(catalog);
    render();
  });

  render();
});