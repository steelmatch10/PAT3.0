// ===== PAT Shared Utilities (storage, formatting, math, address parsing, print) =====

// -------------------------------
// Storage & Persistence Helpers
// -------------------------------
function getCatalog() {
  try {
    const raw = localStorage.getItem("pat_catalog");
    return raw ? JSON.parse(raw) : { schemaVersion: "pat-1.0.0", properties: [] };
  } catch {
    return { schemaVersion: "pat-1.0.0", properties: [] };
  }
}
function saveCatalog(obj) {
  localStorage.setItem("pat_catalog", JSON.stringify(obj));
}
function savePropertyToCatalog(prop) {
  const catalog = getCatalog();
  catalog.properties.push(prop);
  saveCatalog(catalog);
}
function updatePropertyInCatalog(id, updater) {
  const catalog = getCatalog();
  const idx = (catalog.properties || []).findIndex(p => p.id === id);
  if (idx >= 0) {
    catalog.properties[idx] = typeof updater === "function"
      ? updater(catalog.properties[idx])
      : { ...catalog.properties[idx], ...updater };
    catalog.properties[idx].updatedAt = new Date().toISOString();
    saveCatalog(catalog);
    return true;
  }
  return false;
}

function persistFormState(obj) {
  localStorage.setItem("grasp_form", JSON.stringify(obj));
}
function readFormState() {
  try { return JSON.parse(localStorage.getItem("grasp_form")) || {}; }
  catch { return {}; }
}

function saveViewMode(mode) { localStorage.setItem("grasp_viewmode", mode); }
function readViewMode() { return localStorage.getItem("grasp_viewmode") || "monthly"; }

// -------------------------------
// Numeric & Formatting Helpers
// -------------------------------
function toNumber(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

function formatMoney(v) {
  if (!isFinite(v)) return "N/A";
  return "$" + Math.round(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatPct(v) {
  if (!isFinite(v)) return "N/A";
  return (v * 100).toFixed(2) + "%";
}

// -------------------------------
// KPI Banding & Badge CSS helpers
// -------------------------------
function bandCoC(v) {
  if (!isFinite(v)) return { label: "N/A" };
  if (v > 0.07) return { label: "Great" };
  if (v >= 0.05) return { label: "Good" };
  if (v >= 0.03) return { label: "Okay" };
  if (v >= 0) return { label: "Bad" };
  return { label: "Negative" };
}
function bandCapRate(v) {
  if (!isFinite(v)) return { label: "N/A" };
  if (v > 0.12) return { label: "Great" };
  if (v >= 0.08) return { label: "Good" };
  if (v >= 0.05) return { label: "Okay" };
  if (v >= 0) return { label: "Bad" };
  return { label: "Negative" };
}
function bandDSCR(v) {
  if (!isFinite(v)) return { label: "N/A" };
  if (v > 1.36) return { label: "Great" };
  if (v >= 1.21) return { label: "Okay" }; // per your spec
  if (v >= 0) return { label: "Bad" };
  return { label: "N/A" };
}

function kpiClass(b) {
  switch (b?.label) {
    case "Great": return "kpi great";
    case "Good": return "kpi good";
    case "Okay": return "kpi okay";
    case "Bad":
    case "Negative": return "kpi bad";
    default: return "kpi na";
  }
}
function badgeClass(b) {
  switch (b?.label) {
    case "Great": return "badge great";
    case "Good": return "badge good";
    case "Okay": return "badge okay";
    case "Bad":
    case "Negative": return "badge bad";
    default: return "badge na";
  }
}

// -------------------------------
// Address Parsing & Duplicate Check
// -------------------------------
function normalizeWhitespace(s) { return (s || "").replace(/\s+/g, " ").trim(); }

/**
 * parseAddress:
 * Attempts to extract { line1, line2, city, state, zip, country } from a comma-separated string.
 * Heuristics used:
 *  - If the 2nd part looks like a unit ("Apt", "Suite", "Ste", "Unit", "#"), treat as line2, otherwise it's likely part of locality.
 *  - Country recognized as the last segment when it doesn't look like "STATE ZIP".
 *  - City/State/ZIP inferred from the tail segments. Country omitted if "United States".
 */
function parseAddress(raw) {
  const s = normalizeWhitespace(raw);
  if (!s) return { raw: "", line1: "", line2: "", city: "", state: "", zip: "", country: "", normalized: "" };

  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  let line1 = "", line2 = "", city = "", state = "", zip = "", country = "";

  if (parts.length === 1) {
    line1 = parts[0];
  } else {
    line1 = parts[0];

    // Candidate trailing segments
    const last = parts[parts.length - 1];
    const last2 = parts[parts.length - 2] || "";

    // If last is a ZIP (##### or #####-####), then last2 should contain the state, and city is before that.
    if (/^\d{5}(?:-\d{4})?$/.test(last)) {
      const stz = last2.split(/\s+/);
      state = stz[0] || "";
      zip = last || "";
      city = parts[parts.length - 3] || "";
      // If second piece looks like a unit designator, capture as line2
      if (parts[1] && /(?:apt|suite|ste|unit|#)/i.test(parts[1])) line2 = parts[1];
    } else {
      // Otherwise, treat last as country, and last2 as "STATE ZIP"
      country = last;
      const stz = last2.split(/\s+/);
      state = stz[0] || "";
      zip = stz[1] || "";
      city = parts[parts.length - 3] || "";
      if (parts[1] && /(?:apt|suite|ste|unit|#)/i.test(parts[1])) line2 = parts[1];
    }

    // Fallback: handle "line1, city state zip" (2 segments only)
    if (!city && parts.length === 2) {
      const rest = parts[1].split(/\s+/);
      city = rest.slice(0, -2).join(" ") || "";
      state = rest.slice(-2, -1)[0] || "";
      zip = rest.slice(-1)[0] || "";
    }
  }

  // Normalize common country strings
  if (/^(us|usa|united states|united states of america)$/i.test(country)) country = "United States";

  const normalized = (line1 + "|" + line2 + "|" + city + "|" + state + "|" + zip + "|" + country).toLowerCase();
  return { raw: s, line1, line2, city, state, zip, country, normalized };
}

function findDuplicateByAddress(addressRaw) {
  const cat = getCatalog();
  const target = parseAddress(addressRaw);
  if (!target.normalized) return null;
  const hit = (cat.properties || []).find(p => {
    const pa = parseAddress(p?.source?.address || "");
    // Require same line1 and same normalized string for a strict duplicate
    return pa.line1.toLowerCase() === target.line1.toLowerCase() &&
      pa.normalized === target.normalized;
  });
  return hit || null;
}

// -------------------------------
// Carry Cost Conversion (Monthly <-> Annual for Taxes/Insurance/HOA only)
// -------------------------------
function convertCarryCosts(raw, fromMode, toMode) {
  let t = toNumber(raw.taxesMonthly || 0);
  let i = toNumber(raw.insuranceMonthly || 0);
  let h = toNumber(raw.hoaMonthly || 0);
  if (fromMode === "annual") { t /= 12; i /= 12; h /= 12; }
  if (toMode === "annual") { t *= 12; i *= 12; h *= 12; }
  return { ...raw, taxesMonthly: round2(t), insuranceMonthly: round2(i), hoaMonthly: round2(h) };
}

// -------------------------------
// Core Computation (GRASP)
// -------------------------------
function computeAll(input) {
  const propertyValue = toNumber(input.propertyValue);
  const percentDown = toNumber(input.percentDownPct) / 100;
  const rateApr = toNumber(input.rateAprPct) / 100;
  const loanYears = toNumber(input.loanLengthYears || 30);
  const taxesMonthly = toNumber(input.taxesMonthly);
  const insuranceMonthly = toNumber(input.insuranceMonthly);
  const hoaMonthly = toNumber(input.hoaMonthly);
  const estImprovementCost = toNumber(input.estImprovementCost);
  const units = Math.max(0, parseInt(input.bedroomsOrUnits || 0, 10));
  const rentPerUnitMonthly = toNumber(input.rentPerUnitMonthly);

  const downPayment = propertyValue * percentDown;
  const closingCosts = propertyValue * 0.05;        // 5%
  const miscMonthly = (propertyValue * 0.01) / 12;  // 1% annual

  const loanAmount = Math.max(0, propertyValue - downPayment);
  const r = rateApr / 12;
  const n = loanYears * 12;

  let mortgageMonthly = 0;
  if (r === 0) {
    mortgageMonthly = n > 0 ? loanAmount / n : 0;
  } else {
    const denom = (1 - Math.pow(1 + r, -n));
    mortgageMonthly = denom !== 0 ? loanAmount * r / denom : 0;
  }

  const grossRentMonthly = units * rentPerUnitMonthly;
  const operatingExpensesMonthly = taxesMonthly + insuranceMonthly + hoaMonthly + miscMonthly;
  const ownershipCostMonthly = operatingExpensesMonthly + mortgageMonthly;

  const noiAnnual = (grossRentMonthly - operatingExpensesMonthly) * 12;
  const annualCashFlow = (grossRentMonthly - ownershipCostMonthly) * 12;
  const totalInitialInvestment = downPayment + estImprovementCost + closingCosts;

  const capRate = (propertyValue > 0) ? (noiAnnual / propertyValue) : NaN;
  const cashOnCash = (totalInitialInvestment > 0) ? (annualCashFlow / totalInitialInvestment) : NaN;
  const dscr = (mortgageMonthly > 0) ? (noiAnnual / (mortgageMonthly * 12)) : NaN;

  // DSCR target price using 85% of NOI
  function priceForDSCR(target) {
    if (target <= 0) return NaN;
    const ADS = (0.85 * noiAnnual) / target;   // Annual Debt Service target
    const PMT = ADS / 12;                      // Monthly payment target
    let loanTarget = 0;
    if (r === 0) {
      loanTarget = PMT * n;
    } else {
      const denom = (1 - Math.pow(1 + r, -n));
      if (denom === 0) return NaN;
      loanTarget = PMT * denom / r;
    }
    const eq = (1 - percentDown);
    if (eq <= 0) return NaN;
    const price = loanTarget / eq;
    return (isFinite(price) && price > 0) ? price : NaN;
  }

  // Suggested rent / unit to hit targets
  function rentPerUnitForCoC(targetCoC) {
    if (units <= 0) return NaN;
    const numer = targetCoC * totalInitialInvestment + 12 * (operatingExpensesMonthly + mortgageMonthly);
    const denom = 12 * units;
    return denom > 0 ? numer / denom : NaN;
  }
  function rentPerUnitForCap(targetCap) {
    if (units <= 0) return NaN;
    const numer = targetCap * propertyValue + 12 * operatingExpensesMonthly;
    const denom = 12 * units;
    return denom > 0 ? numer / denom : NaN;
  }

  return {
    inputsNormalized: { downPayment, closingCosts, loanAmount, miscMonthly },
    computed: {
      mortgageMonthly, grossRentMonthly, operatingExpensesMonthly, ownershipCostMonthly,
      annualCashFlow, noiAnnual, capRate, cashOnCash, dscr,
      dscrGuidance: { priceForDSCR1_5: priceForDSCR(1.5), priceForDSCR1_2: priceForDSCR(1.2) },
      suggestedRentPerUnit: {
        coc: { pct7: rentPerUnitForCoC(0.07), pct5: rentPerUnitForCoC(0.05), pct3: rentPerUnitForCoC(0.03) },
        cap: { pct12: rentPerUnitForCap(0.12), pct8: rentPerUnitForCap(0.08), pct5: rentPerUnitForCap(0.05) }
      }
    },
    bands: {
      capRate: bandCapRate(capRate),
      cashOnCash: bandCoC(cashOnCash),
      dscr: bandDSCR(dscr)
    }
  };
}

// -------------------------------
// Printable Catalogue (Export → PDF via browser print dialog)
// -------------------------------
function openPrintableCatalogue(props) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = props.map(p => {
    const addr = parseAddress(p?.source?.address || "");
    const head = addr.line1 || "(No address)";
    const subBits = [];
    if (addr.line2) subBits.push(addr.line2);
    const locLine = [addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
    if (locLine) subBits.push(locLine);
    // Country shown only if not US
    if (addr.country && !/^(united states)$/i.test(addr.country)) subBits.push(addr.country);

    const coc = isFinite(p.computed?.cashOnCash) ? (p.computed.cashOnCash * 100).toFixed(2) + "%" : "N/A";
    const cap = isFinite(p.computed?.capRate) ? (p.computed.capRate * 100).toFixed(2) + "%" : "N/A";
    const dscr = isFinite(p.computed?.dscr) ? p.computed.dscr.toFixed(2) : "N/A";
    return `<tr>
      <td>
        <div style="font-weight:700">${head}</div>
        <div style="font-size:12px;color:#555">${subBits.join(" — ")}</div>
      </td>
      <td>${formatMoney(p.inputs.propertyValue)}</td>
      <td>${coc}</td>
      <td>${cap}</td>
      <td>${dscr}</td>
    </tr>`;
  }).join("");
  w.document.write(`
    <html><head><title>PAT Catalogue</title>
    <style>
      body{font-family:Arial, sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f1f3f5}
    </style></head><body>
    <h2>PAT Catalogue</h2>
    <table>
      <thead><tr><th>Address</th><th>Value</th><th>CoC</th><th>Cap</th><th>DSCR</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>window.print();</script>
    </body></html>
  `);
  w.document.close();
}

// -------------------------------
// UI Overlays: Toast + Modal Confirm (dependency-free)
// -------------------------------
(function initUIOverlays() {
  // Toast root
  let toastRoot = document.querySelector(".toast-root");
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toast-root";
    toastRoot.setAttribute("aria-live", "polite");
    toastRoot.setAttribute("role", "region");
    document.body.appendChild(toastRoot);
  }
  // Modal root
  let overlay = document.querySelector(".modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">Confirm</h3>
        <p id="modal-msg">Are you sure?</p>
        <div class="actions">
          <button class="btn" data-act="cancel">Cancel</button>
          <button class="btn primary" data-act="ok">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  // Expose helpers
  window.showToast = function (message, type = "info", opts = {}) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.setAttribute("role", "status");
    const title = opts.title ? `<span class="title">${opts.title}</span>` : "";
    t.innerHTML = `${title}<span>${message}</span>`;
    toastRoot.appendChild(t);
    const ttl = opts.duration ?? 2400;
    let hideTimer = setTimeout(() => dismiss(), ttl);
    function dismiss() {
      if (!t.parentNode) return;
      t.style.transition = "opacity .2s, transform .2s";
      t.style.opacity = "0"; t.style.transform = "translateY(-6px)";
      setTimeout(() => t.remove(), 200);
    }
    t.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    t.addEventListener("mouseleave", () => hideTimer = setTimeout(() => dismiss(), 900));
    return { dismiss };
  };

  window.showConfirm = function ({ title = "Confirm", message = "Proceed?", okText = "OK", cancelText = "Cancel" } = {}) {
    return new Promise((resolve) => {
      const h3 = overlay.querySelector("#modal-title");
      const p = overlay.querySelector("#modal-msg");
      const btnOk = overlay.querySelector('[data-act="ok"]');
      const btnCancel = overlay.querySelector('[data-act="cancel"]');
      h3.textContent = title;
      p.textContent = message;
      btnOk.textContent = okText;
      btnCancel.textContent = cancelText;

      function close(result) {
        overlay.style.display = "none";
        btnOk.removeEventListener("click", onOk);
        btnCancel.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onBackdrop);
        resolve(result);
      }
      function onOk() { close(true); }
      function onCancel() { close(false); }
      function onBackdrop(e) { if (e.target === overlay) close(false); }

      btnOk.addEventListener("click", onOk);
      btnCancel.addEventListener("click", onCancel);
      overlay.addEventListener("click", onBackdrop);
      overlay.style.display = "flex";
      function onKey(e) {
        if (e.key === "Escape") { close(false); }
        else if (e.key === "Enter") { close(true); }
      }
      document.addEventListener("keydown", onKey, { once: true });
    });
  };
})();