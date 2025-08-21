document.addEventListener("DOMContentLoaded", () => {
  const cards = document.getElementById("cards");
  const moduleFilter = document.getElementById("moduleFilter");
  const kpiFilter = document.getElementById("kpiFilter");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearCatalogBtn");

  function render(){
    const catalog = getCatalog();
    let props = catalog.properties || [];
    const mod = moduleFilter.value;
    const kpi = kpiFilter.value;

    if(mod) props = props.filter(p => p.module === mod);
    if(kpi){
      // Match if any essential KPI band equals filter
      props = props.filter(p => [p.bands?.cashOnCash, p.bands?.capRate, p.bands?.dscr].includes(kpi));
    }

    if(props.length===0){
      cards.innerHTML = `<div class="card"><div class="small">No properties logged yet.</div></div>`;
      return;
    }

    const html = props.map(p => {
      const addr = p.source?.address || "(No address)";
      const link = p.source?.link ? `<a href="${p.source.link}" target="_blank">Listing</a>` : "<span class='small'>No link</span>";
      const coc = p.computed?.cashOnCash;
      const cap = p.computed?.capRate;
      const dscr = p.computed?.dscr;
      const bCoC = bandCoC(coc);
      const bCap = bandCapRate(cap);
      const bDSCR = bandDSCR(dscr);

      return `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:800">${addr}</div>
              <div class="small">${link}</div>
              <div class="small">Module: ${p.module}</div>
              <div class="small">Created: ${new Date(p.createdAt).toLocaleString()}</div>
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
        </div>
      `;
    }).join("");

    cards.innerHTML = html;
  }

  moduleFilter.addEventListener("change", render);
  kpiFilter.addEventListener("change", render);

  exportBtn.addEventListener("click", () => {
    const catalog = getCatalog();
    const blob = new Blob([JSON.stringify(catalog, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pat_catalog.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  clearBtn.addEventListener("click", () => {
    if(confirm("This will remove all properties from local storage. Proceed?")){
      localStorage.removeItem("pat_catalog");
      render();
    }
  });

  render();
});