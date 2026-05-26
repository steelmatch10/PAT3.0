// ===== Team Page Logic =====
(async () => {
  const user = await initAuth();
  if (!user) return;

  const member = await getCurrentMember();

  // Investors have no path here — redirect as a safety net
  if (member?.global_role !== 'founder') {
    window.location.href = 'index.html';
    return;
  }

  // Nav
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('roleBadge').textContent = member.global_role;
  document.getElementById('logoutBtn').addEventListener('click', patSignOut);
  initProfileWidget(user, member);

  // ── Load data ────────────────────────────────────────────────────────────────
  // Bust the member cache so we always show the latest saved contact details
  window._patCurrentMember = null;

  const [membersRes, accessRes, propertiesRes] = await Promise.all([
    supabaseClient.from('team_members').select('*').order('global_role').order('email'),
    supabaseClient.from('property_access').select(`
      id, user_id, role, access_approved_at,
      properties(id, street, city, state, zip)
    `).not('access_approved_at', 'is', null),
    supabaseClient.from('properties').select('id, street, city, state, zip').is('deleted_at', null).order('street'),
  ]);

  const members    = membersRes.data  || [];
  const properties = propertiesRes.data || [];

  // Live access map: userId → Set of property IDs, plus row id lookup
  // Keyed as accessMap[userId][propertyId] = { accessRowId }
  const accessMap = {};
  (accessRes.data || []).forEach(row => {
    const pid = row.properties?.id;
    if (!pid) return;
    if (!accessMap[row.user_id]) accessMap[row.user_id] = {};
    accessMap[row.user_id][pid] = { accessRowId: row.id, address: formatAddress(row.properties) };
  });

  document.getElementById('teamSpinner').style.display = 'none';
  document.getElementById('teamContent').style.display = 'block';

  // ── Render ───────────────────────────────────────────────────────────────────
  const founders  = members.filter(m => m.global_role === 'founder' && m.user_id !== user.id);
  const investors = members.filter(m => m.global_role === 'investor');

  if (founders.length === 0) {
    document.querySelector('.section-heading[data-section="founders"]').style.display = 'none';
  }
  document.getElementById('founderGrid').innerHTML  = founders.map(m  => memberCardHtml(m, false)).join('');
  document.getElementById('investorGrid').innerHTML = investors.map(m => memberCardHtml(m, true)).join('');

  wireCards();
  investors.forEach(m => wireRoleTags(m.user_id));

  // ── Card HTML ────────────────────────────────────────────────────────────────
  function memberCardHtml(m, showAccess) {
    const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ') || '—';

    // Founders: read-only contact summary — no editing, no access management
    if (!showAccess) {
      const details = [
        m.email         ? { label: 'Email',           value: m.email }           : null,
        m.email_secondary ? { label: 'Email (alt)',   value: m.email_secondary } : null,
        m.phone_primary   ? { label: 'Phone',         value: m.phone_primary }   : null,
        m.phone_secondary ? { label: 'Phone (alt)',   value: m.phone_secondary } : null,
      ].filter(Boolean);
      return `
        <div class="member-card" data-user-id="${m.user_id}">
          <div class="member-card-header">
            <span class="member-name">${escapeHtml(fullName)}</span>
            <span class="member-role-badge">founder</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${details.length
              ? details.map(d => `
                  <div style="display:flex;gap:8px;align-items:baseline;">
                    <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);min-width:80px;">${d.label}</span>
                    <span style="font-size:13px;color:var(--text);">${escapeHtml(d.value)}</span>
                  </div>`).join('')
              : '<span style="font-size:13px;color:var(--muted);font-style:italic;">No contact details on file.</span>'}
          </div>
        </div>`;
    }

    const assigned = accessMap[m.user_id] || {};

    const accessHtml = showAccess ? `
      <div class="access-section">
        <div class="access-heading">Property Access</div>
        <div class="access-list" id="access-list-${m.user_id}">
          ${Object.values(assigned).length === 0
            ? '<div class="access-empty" id="access-empty-${m.user_id}">No properties assigned yet.</div>'
            : Object.entries(assigned).map(([pid, {address}]) => `
                <div class="access-row" data-property-id="${pid}">
                  <span class="access-addr">${escapeHtml(address)}</span>
                  <span class="access-role">editor</span>
                </div>`).join('')}
        </div>
        <div class="access-panel-wrap">
          <button class="manage-access-btn" data-user-id="${m.user_id}">Grant access ▾</button>
          <div class="access-panel" id="panel-${m.user_id}">
            <div class="access-panel-footer">
              <button class="btn" style="font-size:12px;padding:5px 12px;" data-cancel="${m.user_id}">Cancel</button>
              <button class="btn" style="font-size:12px;padding:5px 12px;background:var(--brand);color:#0e1220;font-weight:700;opacity:.4;cursor:not-allowed;" data-apply="${m.user_id}" disabled>Apply</button>
            </div>
            <div class="access-panel-items">
              ${[...properties]
                .sort((a, b) => (assigned[b.id] ? 1 : 0) - (assigned[a.id] ? 1 : 0))
                .map(p => `
                <label class="access-panel-item">
                  <input type="checkbox" data-property-id="${p.id}" ${assigned[p.id] ? 'checked' : ''} />
                  ${escapeHtml(formatAddress(p))}
                </label>`).join('')}
            </div>
          </div>
        </div>
      </div>` : '';

    return `
      <div class="member-card" data-user-id="${m.user_id}">
        <div class="member-card-header">
          <span class="member-name">${escapeHtml(fullName)}</span>
          <span class="member-role-badge${m.global_role === 'investor' ? ' investor' : ''}">${m.global_role}</span>
        </div>
        <div class="field-grid">
          <div class="field-group">
            <span class="field-label">First Name</span>
            <input class="field-input" data-field="first_name" value="${escapeHtml(m.first_name || '')}" placeholder="First name" />
          </div>
          <div class="field-group">
            <span class="field-label">Last Name</span>
            <input class="field-input" data-field="last_name" value="${escapeHtml(m.last_name || '')}" placeholder="Last name" />
          </div>
          <div class="field-group full">
            <span class="field-label">Primary Email</span>
            <input class="field-input" data-field="email" value="${escapeHtml(m.email || '')}" readonly />
          </div>
          <div class="field-group full">
            <span class="field-label">Secondary Email</span>
            <input class="field-input" data-field="email_secondary" value="${escapeHtml(m.email_secondary || '')}" placeholder="Optional" />
          </div>
          <div class="field-group">
            <span class="field-label">Primary Phone</span>
            <input class="field-input" data-field="phone_primary" value="${escapeHtml(m.phone_primary || '')}" placeholder="Optional" />
          </div>
          <div class="field-group">
            <span class="field-label">Secondary Phone</span>
            <input class="field-input" data-field="phone_secondary" value="${escapeHtml(m.phone_secondary || '')}" placeholder="Optional" />
          </div>
        </div>
        <div class="field-actions">
          <button class="btn save-btn" data-user-id="${m.user_id}" style="font-size:12px;padding:5px 14px;">Save</button>
        </div>
        ${accessHtml}
      </div>`;
  }

  // ── Wire role-tag click to instant revoke ────────────────────────────────────
  async function wireRoleTags(userId) {
    const list = document.getElementById(`access-list-${userId}`);
    if (!list) return;
    list.querySelectorAll('.access-role').forEach(tag => {
      tag.addEventListener('click', async () => {
        const row = tag.closest('.access-row');
        const pid = row?.dataset.propertyId;
        if (!pid || !accessMap[userId]?.[pid]) return;
        const confirmed = await showConfirm({
          title: 'Revoke access?',
          message: `Remove access to ${escapeHtml(accessMap[userId][pid].address)}?`,
          okText: 'Revoke', cancelText: 'Cancel',
        });
        if (!confirmed) return;
        const { error } = await supabaseClient
          .from('property_access')
          .delete()
          .eq('id', accessMap[userId][pid].accessRowId);
        if (error) { showToast('Failed to revoke.', 'error'); return; }
        delete accessMap[userId][pid];
        row.remove();
        if (!Object.keys(accessMap[userId] || {}).length) {
          list.innerHTML = '<div class="access-empty">No properties assigned yet.</div>';
        }
        // Uncheck in panel
        const panel = document.getElementById(`panel-${userId}`);
        const cb = panel?.querySelector(`input[data-property-id="${pid}"]`);
        if (cb) cb.checked = false;
        showToast('Access revoked.', 'success');
      });
    });
  }

  // ── Wire interactions ────────────────────────────────────────────────────────
  function wireCards() {
    // Save contact details
    document.querySelectorAll('.save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.member-card');
        const userId = btn.dataset.userId;
        const updates = {};
        card.querySelectorAll('.field-input:not([readonly])').forEach(inp => {
          updates[inp.dataset.field] = inp.value.trim() || null;
        });
        btn.disabled = true; btn.textContent = 'Saving…';
        const { error } = await supabaseClient
          .from('team_members')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        btn.disabled = false; btn.textContent = 'Save';
        showToast(error ? 'Failed to save.' : 'Saved.', error ? 'error' : 'success');
        if (!error && userId === user.id && window._patCurrentMember) {
          window._patCurrentMember = { ...window._patCurrentMember, ...updates };
        }
      });
    });

    // Manage access toggle
    document.querySelectorAll('.manage-access-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const panel = document.getElementById(`panel-${btn.dataset.userId}`);
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) checkApplyState(btn.dataset.userId);
      });
    });

    // Re-evaluate Apply state on every checkbox change
    document.querySelectorAll('.access-panel').forEach(panel => {
      const userId = panel.id.replace('panel-', '');
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => checkApplyState(userId));
      });
    });

    // Close panels on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.access-panel.open').forEach(p => p.classList.remove('open'));
    });
    document.querySelectorAll('.access-panel').forEach(panel => {
      panel.addEventListener('click', e => e.stopPropagation());
    });

    // Cancel
    document.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = document.getElementById(`panel-${btn.dataset.cancel}`);
        // Reset checkboxes to current state
        const userId = btn.dataset.cancel;
        const assigned = accessMap[userId] || {};
        panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = !!assigned[cb.dataset.propertyId];
        });
        checkApplyState(userId);
        panel.classList.remove('open');
      });
    });

    // Apply
    document.querySelectorAll('[data-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId  = btn.dataset.apply;
        const panel   = document.getElementById(`panel-${userId}`);
        const assigned = accessMap[userId] || {};

        const toGrant  = [];
        const toRevoke = [];

        panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          const pid = cb.dataset.propertyId;
          if (cb.checked && !assigned[pid]) toGrant.push(pid);
          if (!cb.checked && assigned[pid])  toRevoke.push(pid);
        });

        if (toGrant.length === 0 && toRevoke.length === 0) {
          panel.classList.remove('open');
          return;
        }

        btn.disabled = true; btn.textContent = 'Applying…';

        // Revoke
        for (const pid of toRevoke) {
          const { error } = await supabaseClient
            .from('property_access')
            .delete()
            .eq('id', assigned[pid].accessRowId);
          if (!error) delete accessMap[userId][pid];
        }

        // Grant
        for (const pid of toGrant) {
          const prop = properties.find(p => p.id === pid);
          const { data, error } = await supabaseClient
            .from('property_access')
            .insert({
              property_id: pid,
              user_id: userId,
              role: 'editor',
              access_approved_at: new Date().toISOString(),
              access_approved_by: user.id,
            })
            .select('id')
            .single();
          if (!error && prop) {
            if (!accessMap[userId]) accessMap[userId] = {};
            accessMap[userId][pid] = { accessRowId: data.id, address: formatAddress(prop) };
          }
        }

        btn.disabled = false; btn.textContent = 'Apply';
        panel.classList.remove('open');
        checkApplyState(userId);

        // Refresh access list display
        const list = document.getElementById(`access-list-${userId}`);
        const current = accessMap[userId] || {};
        if (Object.keys(current).length === 0) {
          list.innerHTML = '<div class="access-empty">No properties assigned yet.</div>';
        } else {
          list.innerHTML = Object.entries(current).map(([pid, {address}]) => `
            <div class="access-row" data-property-id="${pid}">
              <span class="access-addr">${escapeHtml(address)}</span>
              <span class="access-role">editor</span>
            </div>`).join('');
        }

        wireRoleTags(userId);
        const verb = toGrant.length && toRevoke.length ? 'Access updated.'
          : toGrant.length  ? `Access granted to ${toGrant.length} propert${toGrant.length > 1 ? 'ies' : 'y'}.`
          : `Access revoked from ${toRevoke.length} propert${toRevoke.length > 1 ? 'ies' : 'y'}.`;
        showToast(verb, 'success');
      });
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function checkApplyState(userId) {
    const panel   = document.getElementById(`panel-${userId}`);
    const applyBtn = panel?.querySelector(`[data-apply="${userId}"]`);
    if (!applyBtn) return;
    const assigned = accessMap[userId] || {};
    let hasDiff = false;
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const pid = cb.dataset.propertyId;
      if (cb.checked !== !!assigned[pid]) hasDiff = true;
    });
    applyBtn.disabled = !hasDiff;
    applyBtn.style.opacity = hasDiff ? '1' : '.4';
    applyBtn.style.cursor  = hasDiff ? 'pointer' : 'not-allowed';
  }

  function escapeHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
