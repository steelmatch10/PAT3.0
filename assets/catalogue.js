// ===== Catalogue Page Logic (Supabase-backed) =====
document.addEventListener("DOMContentLoaded", async () => {
  // Auth + role — getCurrentMember is cached after the inline script calls it,
  // so this is a fast cache hit, not a second DB round-trip.
  const session = await patGetSession();
  if (!session) return;

  const member  = await getCurrentMember();
  const founder = member?.global_role === 'founder';
  const investor = member?.global_role === 'investor';

  // Recompute all GRASP scenarios in the background so stored values are fresh.
  // Fire-and-forget — does not block page render or loadData().
  recomputeAllScenarios().catch(err => console.warn('recomputeAllScenarios:', err));

  // For investors, fetch their approved property IDs so those float to the top
  let approvedIds = new Set();
  if (investor) {
    approvedIds = await fetchApprovedPropertyIds();
  }

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const cards        = document.getElementById('cards');
  const tableView    = document.getElementById('tableView');
  const tableBody    = document.getElementById('tableBody');
  const tblSortStatus = document.getElementById('tblSortStatus');
  const searchBox    = document.getElementById('searchBox');
  const moduleFilter = document.getElementById('moduleFilter');
  const spinner      = document.getElementById('catalogueSpinner');
  const btnList      = document.getElementById('viewList');
  const btnTable     = document.getElementById('viewTable');

  let currentView = 'list'; // 'list' | 'table'
  let sortCol = 'updated';  // 'address' | 'scenarios' | 'investment' | 'updated'
  let sortDir = 'desc';     // 'asc' | 'desc'
  let kpiFilter = '';       // '' | 'coc' | 'cap' | 'dscr' | 'roi' | 'good'

  // ── Load data ──────────────────────────────────────────────────────────────
  // Fetch all properties with their scenarios in one query
  let allProperties = [];

  async function loadData() {
    spinner.style.display = 'block';
    cards.innerHTML = '';

    const { data, error } = await supabaseClient
      .from('properties')
      .select(`
        id,
        street,
        city,
        state,
        zip,
        zillow_link,
        created_at,
        updated_at,
        pinned,
        listing_status,
        staged_for_deletion_at,
        scenarios(
          id,
          module,
          scenario_name,
          inputs,
          computed,
          bands,
          archived_at
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    spinner.style.display = 'none';

    if (error) {
      cards.innerHTML = `<div class="cat-empty">Failed to load properties: ${escapeHtml(error.message)}</div>`;
      return;
    }

    allProperties = (data || []).map(p => ({
      ...p,
      scenarios: (p.scenarios || []).filter(s => !s.archived_at),
    }));

    // Auto-finalize expired staged-deletions (5-business-day window elapsed client-side)
    const expired = allProperties.filter(p =>
      p.staged_for_deletion_at && businessDaysUntilDeletion(p.staged_for_deletion_at) <= 0
    );
    if (expired.length > 0) {
      await Promise.all(expired.map(p => softDeleteProperty(p.id).catch(() => {})));
      allProperties = allProperties.filter(p =>
        !expired.some(e => e.id === p.id)
      );
    }

    render();
  }

  // ── Filtering & sorting ────────────────────────────────────────────────────
  function latestActivity(p) {
    if (!p.scenarios.length) return new Date(p.updated_at || p.created_at);
    return p.scenarios.reduce((max, s) => {
      const d = new Date(s.updated_at || 0);
      return d > max ? d : max;
    }, new Date(0));
  }

  function bestInvestment(p) {
    const s = bestScenario(p.scenarios);
    if (!s) return -Infinity;
    if (s.module === 'FRAT') {
      return (parseFloat(s.inputs?.propertyValue) || 0) + (parseFloat(s.inputs?.estFixingCost) || 0);
    }
    const val  = parseFloat(s.inputs?.propertyValue) || 0;
    const down = val * ((parseFloat(s.inputs?.percentDownPct) || 0) / 100);
    const closing = parseFloat(s.inputs?.closingCosts) || 0;
    return down + closing + (parseFloat(s.inputs?.estImprovementCost) || 0);
  }

  function passesKpiFilter(p) {
    if (!kpiFilter) return true;
    const s = bestScenario(p.scenarios);
    if (!s) return false;
    const coc  = s.computed?.cashOnCash;
    const cap  = s.computed?.capRate;
    const dscr = s.computed?.dscr;
    const roi  = s.computed?.roi;
    switch (kpiFilter) {
      case 'coc':  return isFinite(coc)  && coc  >= 0.05;
      case 'cap':  return isFinite(cap)  && cap  >= 0.08;
      case 'dscr': return isFinite(dscr) && dscr >= 1.2;
      case 'roi':  return isFinite(roi)  && roi  >= 0.20;
      default: return true;
    }
  }

  function filteredProperties() {
    const q   = (searchBox.value || '').toLowerCase().trim();
    const mod = moduleFilter.value;

    let props = allProperties.filter(p => {
      const addrFull = formatAddress(p).toLowerCase();
      const addressMatch = !q || addrFull.includes(q);
      const moduleMatch  = !mod || p.scenarios.length === 0 || p.scenarios.some(s => s.module === mod);
      const kpiMatch     = currentView === 'table' ? passesKpiFilter(p) : true;
      return addressMatch && moduleMatch && kpiMatch;
    });

    // Sort — pinned (founders) or approved (investors) always floats to top
    const isElevated = p => founder ? !!p.pinned : approvedIds.has(p.id);
    const dir = sortDir === 'asc' ? 1 : -1;
    props = [...props].sort((a, b) => {
      const pinDiff = (isElevated(b) ? 1 : 0) - (isElevated(a) ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      switch (sortCol) {
        case 'address':    return dir * (a.street || '').localeCompare(b.street || '');
        case 'scenarios':  return dir * (a.scenarios.length - b.scenarios.length);
        case 'investment': return dir * (bestInvestment(a) - bestInvestment(b));
        case 'updated':
        default:
          return dir * (latestActivity(a) - latestActivity(b));
      }
    });

    return props;
  }

  // ── Best scenario logic ────────────────────────────────────────────────────
  // For GRASP: best = highest CoC. For FRAT: best = highest ROI.
  // If mixed modules on a property, prefer GRASP.
  function bestScenario(scenarios) {
    if (!scenarios || scenarios.length === 0) return null;

    const graspScenarios = scenarios.filter(s => s.module === 'GRASP');
    const fratScenarios  = scenarios.filter(s => s.module === 'FRAT');

    if (graspScenarios.length > 0) {
      return graspScenarios.reduce((best, s) => {
        const coc = s.computed?.cashOnCash ?? -Infinity;
        return coc > (best.computed?.cashOnCash ?? -Infinity) ? s : best;
      });
    }
    return fratScenarios.reduce((best, s) => {
      const roi = s.computed?.roi ?? -Infinity;
      return roi > (best.computed?.roi ?? -Infinity) ? s : best;
    });
  }

  // ── KPI badge HTML ─────────────────────────────────────────────────────────
  function capitalRequired(scenario) {
    const inp = scenario.inputs || {};
    if (scenario.module === 'FRAT') {
      return (parseFloat(inp.propertyValue) || 0) + (parseFloat(inp.estFixingCost) || 0);
    }
    const val  = parseFloat(inp.propertyValue) || 0;
    const down = val * ((parseFloat(inp.percentDownPct) || 0) / 100);
    const closing = parseFloat(inp.closingCosts) || 0;
    return down + closing + (parseFloat(inp.estImprovementCost) || 0);
  }

  function kpiBadgesHtml(scenario) {
    if (!scenario) return `<div class="cat-kpi-group"><span class="cat-no-scenarios">No scenarios yet</span></div>`;

    const total = capitalRequired(scenario);
    const capitalHtml = `
      <div class="cat-capital">
        <span class="cat-capital-label">Capital Required</span>
        <span class="cat-capital-value">${isFinite(total) && total > 0 ? formatMoney(total) : 'N/A'}</span>
      </div>`;

    let badgesHtml;
    if (scenario.module === 'FRAT') {
      const roi  = scenario.computed?.roi;
      const band = (function(v) {
        if (!isFinite(v)) return { label: 'N/A' };
        if (v > 0.40) return { label: 'Amazing' };
        if (v >= 0.30) return { label: 'Great' };
        if (v >= 0.20) return { label: 'Good' };
        if (v >= 0.10) return { label: 'Okay' };
        if (v >= 0)    return { label: 'Bad' };
        return { label: 'Negative' };
      })(roi);
      badgesHtml = `<div class="${badgeClass(band)}">ROI ${isFinite(roi) ? (roi * 100).toFixed(2) + '%' : 'N/A'}</div>`;
    } else {
      const coc  = scenario.computed?.cashOnCash;
      const cap  = scenario.computed?.capRate;
      const dscr = scenario.computed?.dscr;
      badgesHtml = `
        <div class="${badgeClass(bandCoC(coc))}">CoC ${isFinite(coc) ? (coc * 100).toFixed(2) + '%' : 'N/A'}</div>
        <div class="${badgeClass(bandCapRate(cap))}">Cap ${isFinite(cap) ? (cap * 100).toFixed(2) + '%' : 'N/A'}</div>
        <div class="${badgeClass(bandDSCR(dscr))}">DSCR ${isFinite(dscr) ? dscr.toFixed(2) : 'N/A'}</div>`;
    }

    return `
      <div class="cat-kpi-group">
        <div class="cat-kpis">${badgesHtml}</div>
        ${capitalHtml}
      </div>`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    const props = filteredProperties();

    if (currentView === 'table') {
      cards.style.display = 'none';
      tableView.style.display = 'block';
      renderTable(props);
      return;
    }

    tableView.style.display = 'none';
    cards.style.display = 'grid';

    if (props.length === 0) {
      cards.innerHTML = `<div class="cat-empty">No properties match your filters.</div>`;
      return;
    }

    cards.innerHTML = props.map(p => {
      const best       = bestScenario(p.scenarios);
      const scenCount  = p.scenarios.length;
      const module     = best?.module ?? null;
      const targetPage = module === 'FRAT' ? 'FRAT.html' : 'GRASP.html';

      const street   = p.street || '';
      const locality = [p.city, p.state && p.zip ? `${p.state} ${p.zip}` : (p.state || p.zip)].filter(Boolean).join(', ');

      const scenLabel = scenCount === 0
        ? 'No scenarios yet'
        : `${scenCount} scenario${scenCount !== 1 ? 's' : ''}${best ? ` · best: ${escapeHtml(best.scenario_name)}` : ''}`;

      return `
        <div class="cat-card${(founder && p.pinned) || (investor && approvedIds.has(p.id)) ? ' cat-card-pinned' : ''}" data-id="${p.id}">
          <div class="cat-card-header">
            <div class="cat-card-top">
              ${founder ? `<input type="checkbox" class="cat-select" data-id="${p.id}" onclick="event.stopPropagation()" />` : ''}
              ${founder && p.pinned ? '<span class="cat-pin-badge">Pinned</span>' : ''}
              ${investor && approvedIds.has(p.id) ? '<span class="cat-pin-badge investor">Scenario editing enabled</span>' : ''}
              ${p.listing_status ? `<span class="cat-pin-badge listing-status">${escapeHtml(p.listing_status)}</span>` : ''}
              ${founder && p.staged_for_deletion_at ? (() => {
                const days = businessDaysUntilDeletion(p.staged_for_deletion_at);
                return `<span class="cat-staged-banner">Removing in ${days} day${days !== 1 ? 's' : ''} — <button class="cat-undo-btn" data-id="${p.id}" onclick="event.stopPropagation()">Undo</button></span>`;
              })() : ''}
            </div>
            <div class="cat-addr">
              <div class="cat-addr-main">${escapeHtml(street)}</div>
              ${locality ? `<div class="cat-addr-locality">${escapeHtml(locality)}</div>` : ''}
              <div class="cat-addr-meta">
                ${scenLabel}
                &nbsp;·&nbsp;
                Updated ${formatDate(p.updated_at || p.created_at)}
                ${p.zillow_link ? `&nbsp;·&nbsp;<a href="${escapeHtml(p.zillow_link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Zillow ↗</a>` : ''}
              </div>
            </div>
          </div>
          ${kpiBadgesHtml(best)}
          <div class="cat-card-footer">
            <a class="btn" href="${targetPage}?propertyId=${p.id}">Open →</a>
          </div>
        </div>`;
    }).join('');
  }

  // ── Table render ───────────────────────────────────────────────────────────
  function renderTable(props) {
    if (props.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);">No properties match your filters.</td></tr>`;
      return;
    }
    tableBody.innerHTML = props.map(p => {
      const best       = bestScenario(p.scenarios);
      const scenCount  = p.scenarios.length;
      const module     = best?.module ?? null;
      const targetPage = module === 'FRAT' ? 'FRAT.html' : 'GRASP.html';

      const street   = p.street || '';
      const locality = [p.city, p.state && p.zip ? `${p.state} ${p.zip}` : (p.state || p.zip)].filter(Boolean).join(', ');

      // KPI cells
      let kpiHtml = '<span style="color:var(--muted);font-style:italic;font-size:12px;">No scenarios</span>';
      let investHtml = '—';
      if (best) {
        if (best.module === 'FRAT') {
          const roi  = best.computed?.roi;
          const band = (function(v) {
            if (!isFinite(v)) return { label: 'N/A' };
            if (v > 0.40) return { label: 'Amazing' };
            if (v >= 0.30) return { label: 'Great' };
            if (v >= 0.20) return { label: 'Good' };
            if (v >= 0.10) return { label: 'Okay' };
            if (v >= 0)    return { label: 'Bad' };
            return { label: 'Negative' };
          })(roi);
          kpiHtml = `<div class="tbl-kpis"><span class="${badgeClass(band)}">ROI ${isFinite(roi) ? (roi*100).toFixed(1)+'%' : 'N/A'}</span></div>`;
          const acq = parseFloat(best.inputs?.propertyValue) || 0;
          const rehab = parseFloat(best.inputs?.estFixingCost) || 0;
          investHtml = formatMoney(acq + rehab);
        } else {
          const coc  = best.computed?.cashOnCash;
          const cap  = best.computed?.capRate;
          const dscr = best.computed?.dscr;
          kpiHtml = `<div class="tbl-kpis">
            <span class="${badgeClass(bandCoC(coc))}">CoC ${isFinite(coc) ? (coc*100).toFixed(1)+'%' : 'N/A'}</span>
            <span class="${badgeClass(bandCapRate(cap))}">Cap ${isFinite(cap) ? (cap*100).toFixed(1)+'%' : 'N/A'}</span>
            <span class="${badgeClass(bandDSCR(dscr))}">DSCR ${isFinite(dscr) ? dscr.toFixed(2) : 'N/A'}</span>
          </div>`;
          const val   = parseFloat(best.inputs?.propertyValue) || 0;
          const down  = val * ((parseFloat(best.inputs?.percentDownPct) || 0) / 100);
          const closing = parseFloat(best.inputs?.closingCosts) || 0;
          const improv = parseFloat(best.inputs?.estImprovementCost) || 0;
          investHtml = formatMoney(down + closing + improv);
        }
      }

      return `<tr data-id="${p.id}"${(founder && p.pinned) || (investor && approvedIds.has(p.id)) ? ' class="tbl-row-pinned"' : ''}>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            ${founder ? `<input type="checkbox" class="cat-select" data-id="${p.id}" />` : ''}
            <div>
              <div class="tbl-street">
                ${escapeHtml(street)}
                ${founder && p.pinned ? '<span class="cat-pin-badge">Pinned</span>' : ''}
                ${investor && approvedIds.has(p.id) ? '<span class="cat-pin-badge investor">Scenario editing enabled</span>' : ''}
              </div>
              ${locality ? `<div class="tbl-locality">${escapeHtml(locality)}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${scenCount}</td>
        <td>${kpiHtml}</td>
        <td class="tbl-invest">${investHtml}</td>
        <td>${formatDate(p.updated_at || p.created_at)}</td>
        <td class="tbl-open"><a class="btn" href="${targetPage}?propertyId=${p.id}">Open →</a></td>
      </tr>`;
    }).join('');
  }

  // ── View toggle ─────────────────────────────────────────────────────────────
  btnList.addEventListener('click', () => {
    currentView = 'list';
    btnList.classList.add('active');
    btnTable.classList.remove('active');
    render();
  });
  btnTable.addEventListener('click', () => {
    currentView = 'table';
    btnTable.classList.add('active');
    btnList.classList.remove('active');
    render();
  });

  // ── Table sort headers ───────────────────────────────────────────────────────
  const COL_LABELS = { address: 'Address', scenarios: 'Scenarios', investment: 'Capital', updated: 'Updated' };
  const KPI_LABELS = { coc: 'CoC ≥ 5%', cap: 'Cap ≥ 8%', dscr: 'DSCR ≥ 1.2', roi: 'ROI ≥ 20%', good: 'Any metric meets Good' };

  function updateSortIcons() {
    document.querySelectorAll('#tblSortRow th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (th.dataset.col === sortCol) {
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
      } else {
        if (icon) icon.textContent = '↕';
      }
    });

    // Status line — sort only (KPI filter shown via header indicator)
    tblSortStatus.innerHTML = sortCol
      ? `Sorted by <span>${COL_LABELS[sortCol]} ${sortDir === 'asc' ? '↑' : '↓'}</span>`
      : '';
  }

  document.querySelectorAll('#tblSortRow th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = th.dataset.col;
        sortDir = th.dataset.col === 'address' ? 'asc' : 'desc';
      }
      updateSortIcons();
      render();
    });
  });

  // ── KPI dropdown ─────────────────────────────────────────────────────────────
  const thKpi         = document.getElementById('thKpi');
  const kpiDropdown   = document.getElementById('kpiDropdown');
  const kpiIndicator  = document.getElementById('kpiActiveIndicator');

  thKpi.addEventListener('click', e => {
    e.stopPropagation();
    kpiDropdown.classList.toggle('open');
  });

  // Close when clicking outside
  document.addEventListener('click', () => kpiDropdown.classList.remove('open'));

  kpiDropdown.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      kpiFilter = btn.dataset.val;
      // Update selected state
      kpiDropdown.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // Show/hide indicator
      kpiIndicator.classList.toggle('visible', !!kpiFilter);
      kpiDropdown.classList.remove('open');
      updateSortIcons();
      render();
    });
  });

  // ── Pin / Unpin (founders only) ────────────────────────────────────────────
  const pinBtn = document.getElementById('pinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', async () => {
      const checked = [...document.querySelectorAll('.cat-select:checked')].map(cb => cb.dataset.id);
      if (checked.length === 0) {
        showToast('Select at least one property to pin/unpin.', 'info');
        return;
      }
      const selectedProps = allProperties.filter(p => checked.includes(p.id));
      const toPin   = selectedProps.filter(p => !p.pinned).map(p => p.id);
      const toUnpin = selectedProps.filter(p =>  p.pinned).map(p => p.id);
      pinBtn.disabled = true;
      try {
        await Promise.all([
          toPin.length   ? togglePinProperties(toPin,   true)  : Promise.resolve(),
          toUnpin.length ? togglePinProperties(toUnpin, false) : Promise.resolve(),
        ]);
        // Update local state without full reload
        allProperties = allProperties.map(p => {
          if (toPin.includes(p.id))   return { ...p, pinned: true  };
          if (toUnpin.includes(p.id)) return { ...p, pinned: false };
          return p;
        });
        const pinnedCount   = toPin.length;
        const unpinnedCount = toUnpin.length;
        const msg = [
          pinnedCount   ? `${pinnedCount} pinned`     : '',
          unpinnedCount ? `${unpinnedCount} unpinned` : '',
        ].filter(Boolean).join(', ');
        showToast(`${msg}.`, 'success');
        render();
      } catch (err) {
        showToast('Failed to update pin state.', 'error');
      } finally {
        pinBtn.disabled = false;
      }
    });
  }

  // ── Undo staged deletion (event delegation on cards container) ───────────
  cards.addEventListener('click', async e => {
    const undoBtn = e.target.closest('.cat-undo-btn');
    if (!undoBtn) return;
    e.stopPropagation();
    const propertyId = undoBtn.dataset.id;
    try {
      await cancelStagedDeletion(propertyId);
      allProperties = allProperties.map(p =>
        p.id === propertyId ? { ...p, staged_for_deletion_at: null } : p
      );
      showToast('Staged removal cancelled. Property is back to archived status.', 'success');
      render();
    } catch (err) {
      showToast('Failed to cancel removal.', 'error');
    }
  });

  // ── Export (founders only) ─────────────────────────────────────────────────
  const exportBtn    = document.getElementById('exportBtn');
  const exportSelect = document.getElementById('exportSelect');

  function getSelectedIds() {
    return [...document.querySelectorAll('.cat-select:checked')].map(cb => cb.dataset.id);
  }

  function updateExportBtnLabel() {
    if (!exportBtn) return;
    const selectedIds = getSelectedIds();
    exportBtn.textContent = selectedIds.length > 0 ? 'Export Selected' : 'Export All';
  }

  // Delegate checkbox change events on the cards/table containers
  ['cards', 'tableView'].forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) {
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('cat-select')) updateExportBtnLabel();
      });
    }
  });

  function generateCsv(props) {
    const CSV_COLS = [
      'address', 'scenario_name', 'scenario_description', 'module',
      'propertyValue', 'percentDownPct', 'rateAprPct', 'loanLengthYears',
      'estImprovementCost', 'closingCosts', 'bedroomsOrUnits', 'rentPerUnitMonthly',
      'taxesMonthly', 'taxesAnnual', 'insuranceMonthly', 'hoaMonthly',
      'coC', 'capRate', 'dscr',
      'suggestedRentCoC7pct', 'suggestedRentCoC5pct', 'suggestedRentCoC3pct',
      'suggestedRentCap12pct', 'suggestedRentCap8pct', 'suggestedRentCap5pct',
    ];
    const escCsv = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [CSV_COLS.join(',')];
    for (const p of props) {
      const scenarios = p.scenarios || [];
      if (scenarios.length === 0) {
        rows.push(CSV_COLS.map(col => col === 'address' ? escCsv(formatAddress(p)) : '').join(','));
        continue;
      }
      for (const s of scenarios) {
        const inp = s.inputs || {};
        const comp = s.computed || {};
        const sugRent = comp.suggestedGrossRent || comp.suggestedRentPerUnit || {};
        const row = CSV_COLS.map(col => {
          switch (col) {
            case 'address':             return escCsv(formatAddress(p));
            case 'scenario_name':       return escCsv(s.scenario_name);
            case 'scenario_description': return escCsv(s.scenario_description);
            case 'module':              return escCsv(s.module);
            case 'propertyValue':       return escCsv(inp.propertyValue);
            case 'percentDownPct':      return escCsv(inp.percentDownPct != null ? inp.percentDownPct / 100 : '');
            case 'rateAprPct':          return escCsv(inp.rateAprPct != null ? inp.rateAprPct / 100 : '');
            case 'loanLengthYears':     return escCsv(inp.loanLengthYears);
            case 'estImprovementCost':  return escCsv(inp.estImprovementCost);
            case 'closingCosts':        return escCsv(inp.closingCosts);
            case 'bedroomsOrUnits':     return escCsv(s.bedrooms_or_units);
            case 'rentPerUnitMonthly':  return escCsv(inp.rentPerUnitMonthly);
            case 'taxesMonthly':        return escCsv(inp.taxesAnnual != null ? (inp.taxesAnnual / 12).toFixed(2) : '');
            case 'taxesAnnual':         return escCsv(inp.taxesAnnual);
            case 'insuranceMonthly':    return escCsv(inp.insuranceMonthly);
            case 'hoaMonthly':          return escCsv(inp.hoaMonthly);
            case 'coC':                 return escCsv(comp.cashOnCash != null ? comp.cashOnCash.toFixed(4) : '');
            case 'capRate':             return escCsv(comp.capRate != null ? comp.capRate.toFixed(4) : '');
            case 'dscr':                return escCsv(comp.dscr != null ? comp.dscr.toFixed(4) : '');
            case 'suggestedRentCoC7pct':  return escCsv(typeof sugRent === 'object' ? (sugRent.coc?.pct7 ?? '') : '');
            case 'suggestedRentCoC5pct':  return escCsv(typeof sugRent === 'object' ? (sugRent.coc?.pct5 ?? '') : '');
            case 'suggestedRentCoC3pct':  return escCsv(typeof sugRent === 'object' ? (sugRent.coc?.pct3 ?? '') : '');
            case 'suggestedRentCap12pct': return escCsv(typeof sugRent === 'object' ? (sugRent.cap?.pct12 ?? '') : '');
            case 'suggestedRentCap8pct':  return escCsv(typeof sugRent === 'object' ? (sugRent.cap?.pct8 ?? '') : '');
            case 'suggestedRentCap5pct':  return escCsv(typeof sugRent === 'object' ? (sugRent.cap?.pct5 ?? '') : '');
            default: return '';
          }
        });
        rows.push(row.join(','));
      }
    }
    return rows.join('\n');
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const selectedIds = getSelectedIds();
      let props = filteredProperties();
      if (selectedIds.length > 0) {
        props = props.filter(p => selectedIds.includes(p.id));
      }

      if (exportSelect.value === 'json') {
        const blob = new Blob([JSON.stringify({ properties: props }, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'pat_catalogue_export.json'; a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${props.length} propert${props.length === 1 ? 'y' : 'ies'} as JSON`, 'success');
      } else if (exportSelect.value === 'csv') {
        const csv  = generateCsv(props);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'pat_catalogue_export.csv'; a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${props.length} propert${props.length === 1 ? 'y' : 'ies'} as CSV`, 'success');
      }
    });
  }

  // ── Search & filter ────────────────────────────────────────────────────────
  searchBox.addEventListener('input', render);
  moduleFilter.addEventListener('change', render);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  await loadData();
});
