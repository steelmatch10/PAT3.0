// ===== Settings Page Logic (password change, MFA enroll/unenroll) =====
(async () => {
  const user = await initAuth();
  if (!user) return;

  const member = await getCurrentMember();

  document.getElementById('userEmail').textContent = user.email;
  const badge = document.getElementById('roleBadge');
  badge.textContent = member?.global_role ?? 'member';
  if (member?.global_role === 'investor') badge.classList.add('investor');
  document.getElementById('logoutBtn').addEventListener('click', patSignOut);

  document.getElementById('spinner').classList.remove('visible');
  document.getElementById('settingsContent').style.display = 'block';

  // ── Change Password ──────────────────────────────────────────────────────────
  const passwordForm    = document.getElementById('passwordForm');
  const currentPwEl     = document.getElementById('currentPassword');
  const newPwEl          = document.getElementById('newPassword');
  const confirmPwEl      = document.getElementById('confirmPassword');
  const passwordError    = document.getElementById('passwordError');
  const passwordSuccess  = document.getElementById('passwordSuccess');
  const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');

  function showPasswordError(msg) {
    passwordSuccess.classList.remove('visible');
    passwordError.textContent = msg;
    passwordError.classList.add('visible');
  }
  function showPasswordSuccess(msg) {
    passwordError.classList.remove('visible');
    passwordSuccess.textContent = msg;
    passwordSuccess.classList.add('visible');
  }

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordError.classList.remove('visible');
    passwordSuccess.classList.remove('visible');

    const currentPassword = currentPwEl.value;
    const newPassword     = newPwEl.value;
    const confirmPassword = confirmPwEl.value;

    if (!currentPassword) { showPasswordError('Enter your current password.'); return; }
    if (newPassword.length < 8) { showPasswordError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { showPasswordError('New password and confirmation do not match.'); return; }

    passwordSubmitBtn.disabled = true;
    passwordSubmitBtn.textContent = 'Updating…';

    // Re-authenticate before allowing the change — proves the caller knows the
    // current password, not just that they hold a valid session.
    const { error: reauthError } = await patReauthenticate(user.email, currentPassword);
    if (reauthError) {
      showPasswordError('Current password is incorrect.');
      passwordSubmitBtn.disabled = false;
      passwordSubmitBtn.textContent = 'Update Password';
      return;
    }

    const { error: updateError } = await patUpdatePassword(newPassword);
    if (updateError) {
      showPasswordError(updateError.message || 'Failed to update password.');
      passwordSubmitBtn.disabled = false;
      passwordSubmitBtn.textContent = 'Update Password';
      return;
    }

    // Supabase's updateUser() only rotates the current session; other signed-in
    // devices remain valid. Make that explicit rather than letting the user assume
    // the password change logged everyone else out.
    showPasswordSuccess('Password updated. Other signed-in devices are not automatically signed out — sign out everywhere above if needed.');
    passwordForm.reset();
    passwordSubmitBtn.disabled = false;
    passwordSubmitBtn.textContent = 'Update Password';
  });

  // ── Two-Factor Authentication ─────────────────────────────────────────────────
  const mfaStatusText  = document.getElementById('mfaStatusText');
  const mfaActionBtn   = document.getElementById('mfaActionBtn');
  const mfaEnrollPanel = document.getElementById('mfaEnrollPanel');
  const mfaQrCode      = document.getElementById('mfaQrCode');
  const mfaSecret       = document.getElementById('mfaSecret');
  const mfaVerifyCode   = document.getElementById('mfaVerifyCode');
  const mfaError        = document.getElementById('mfaError');
  const mfaCancelBtn    = document.getElementById('mfaCancelBtn');
  const mfaVerifyBtn    = document.getElementById('mfaVerifyBtn');
  const mfaCopySecretBtn = document.getElementById('mfaCopySecretBtn');

  let pendingFactorId = null;
  let verifiedFactor = null;

  function showMfaError(msg) {
    mfaError.textContent = msg;
    mfaError.classList.add('visible');
  }
  function hideMfaError() {
    mfaError.classList.remove('visible');
  }

  async function refreshMfaStatus() {
    hideMfaError();
    const { data, error } = await patMfaListFactors();
    if (error) { showMfaError(error.message); return; }
    verifiedFactor = (data?.totp || []).find(f => f.status === 'verified') || null;

    if (verifiedFactor) {
      mfaStatusText.classList.add('enrolled');
      mfaStatusText.innerHTML = '<span class="dot"></span>Enrolled';
      mfaActionBtn.textContent = 'Unenroll';
    } else {
      mfaStatusText.classList.remove('enrolled');
      mfaStatusText.innerHTML = '<span class="dot"></span>Not enrolled';
      mfaActionBtn.textContent = 'Enroll';
    }
    mfaEnrollPanel.style.display = 'none';
  }

  async function startEnroll() {
    hideMfaError();
    mfaActionBtn.disabled = true;

    // Clean up any stale unverified factor from a prior abandoned/failed enroll
    // attempt first — Supabase caps the number of factors per user, so leftover
    // unverified ones can silently block new enrollment.
    const { data: existing } = await patMfaListFactors();
    const stale = (existing?.totp || []).filter(f => f.status === 'unverified');
    for (const factor of stale) {
      await patMfaUnenroll(factor.id);
    }

    const { data, error } = await patMfaEnroll();
    mfaActionBtn.disabled = false;
    if (error) { showMfaError(error.message); return; }

    pendingFactorId = data.id;
    mfaQrCode.innerHTML = addSvgViewBox(data.totp.qr_code);
    mfaSecret.textContent = data.totp.secret;
    mfaVerifyCode.value = '';
    mfaEnrollPanel.style.display = 'block';
  }

  /**
   * Supabase's TOTP QR code SVG has width/height but no viewBox. Scaling such
   * an SVG via CSS width/height distorts its internal coordinate grid, which
   * can break scannability for authenticator apps. Adding a viewBox matching
   * the native dimensions makes CSS scaling safe (proportional, no distortion).
   */
  function addSvgViewBox(svgString) {
    const match = svgString.match(/<svg[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/);
    if (!match) return svgString;
    const [, width, height] = match;
    if (/viewBox=/.test(svgString)) return svgString;
    return svgString.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }

  mfaActionBtn.addEventListener('click', async () => {
    if (verifiedFactor) {
      await confirmAndUnenroll();
    } else {
      await startEnroll();
    }
  });

  async function confirmAndUnenroll() {
    const ok = await showMfaUnenrollConfirmModal();
    if (!ok) return;
    mfaActionBtn.disabled = true;
    const { error } = await patMfaUnenroll(verifiedFactor.id);
    mfaActionBtn.disabled = false;
    if (error) { showMfaError(error.message); return; }
    await refreshMfaStatus();
  }

  /**
   * Type-to-confirm modal for removing the user's only MFA factor.
   * Mirrors showEraseConfirmModal's pattern (app.js) but confirms a fixed word
   * since there's no address-like value to type here.
   */
  function showMfaUnenrollConfirmModal() {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'modal-overlay';
      el.style.display = 'flex';
      el.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="unenroll-modal-title" style="max-width:440px;">
          <div class="modal-header">
            <div class="modal-icon erase">⚠</div>
            <h3 id="unenroll-modal-title" style="margin:0;">Remove Two-Factor Authentication</h3>
          </div>
          <p>This removes your authenticator app as a second factor. Your account will only be protected by your password.</p>
          <label class="modal-field">
            Type REMOVE to confirm
            <input type="text" id="unenroll-confirm" placeholder="REMOVE" autocomplete="off" />
          </label>
          <div class="actions" style="margin-top:1.25rem;">
            <button class="btn" data-choice="cancel">Cancel</button>
            <button class="btn btn-danger" data-choice="remove" disabled>Remove</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      const input = el.querySelector('#unenroll-confirm');
      const removeBtn = el.querySelector('[data-choice="remove"]');
      input.addEventListener('input', () => {
        removeBtn.disabled = input.value.trim().toUpperCase() !== 'REMOVE';
      });
      function pick(choice) {
        el.remove();
        resolve(choice === 'remove');
      }
      el.querySelectorAll('[data-choice]').forEach(btn =>
        btn.addEventListener('click', () => { if (!btn.disabled) pick(btn.dataset.choice); })
      );
      el.addEventListener('click', (e) => { if (e.target === el) pick('cancel'); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); pick('cancel'); }
      });
      input.focus();
    });
  }

  mfaCancelBtn.addEventListener('click', () => {
    hideMfaError();
    mfaEnrollPanel.style.display = 'none';
    pendingFactorId = null;
  });

  mfaCopySecretBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(mfaSecret.textContent);
      const original = mfaCopySecretBtn.textContent;
      mfaCopySecretBtn.textContent = 'Copied';
      setTimeout(() => { mfaCopySecretBtn.textContent = original; }, 1500);
    } catch {
      showMfaError('Could not copy automatically — select and copy the code manually.');
    }
  });

  mfaVerifyBtn.addEventListener('click', async () => {
    hideMfaError();
    const code = mfaVerifyCode.value.trim();
    if (!/^\d{6}$/.test(code)) { showMfaError('Enter the 6-digit code from your authenticator app.'); return; }

    mfaVerifyBtn.disabled = true;
    mfaVerifyBtn.textContent = 'Verifying…';

    const { data: challenge, error: challengeError } = await patMfaChallenge(pendingFactorId);
    if (challengeError) {
      showMfaError(challengeError.message);
      mfaVerifyBtn.disabled = false;
      mfaVerifyBtn.textContent = 'Verify & Enable';
      return;
    }

    const { error: verifyError } = await patMfaVerify(pendingFactorId, challenge.id, code);
    mfaVerifyBtn.disabled = false;
    mfaVerifyBtn.textContent = 'Verify & Enable';
    if (verifyError) {
      showMfaError('Incorrect code. Please try again.');
      return;
    }

    pendingFactorId = null;
    await refreshMfaStatus();
  });

  await refreshMfaStatus();
})();
