// ── Auth UI Controller ─────────────────────────────────────────────────────────
// Depends on: db.js (dbSignIn, dbSignUp, dbSignOut, dbGetSession, dbOnAuthChange,
//                     dbSaveSettings, dbLoadSettings, dbDeleteSettings)
//             strategy.js (renderStrategyDashboard)
//             DOM elements added in index.html

// Input IDs to capture as strategy settings
const SI_INPUT_IDS = [
    'siLumpSum', 'siMonthly', 'siStartDate', 'siStopOffset',
    'siProjBottomPrice', 'siProjTopPrice',
    'siT1Price', 'siT1Backstop', 'siT2Price', 'siT2Backstop', 'siT3Price', 'siT3Backstop',
    'allocBTCDirect', 'allocBTCLev', 'allocMSTR', 'btcLevMult', 'mstrLevMult',
    'siOppMstrAmt', 'siOppMstrDate', 'siOppLevAmt', 'siOppLevDate',
    'siUseZSignals', 'siZSigBuyAmt', 'siZSigSellPct',
    'siSigBuyDipPct', 'siSigBuyAmt', 'siSigSellDropPct', 'siSigSellThresh', 'siSigSellPct',
    'siHoldLevTop', 'siHoldMstrTop'
];

// Checkbox IDs
const SI_CHECKBOX_IDS = ['siUseZSignals', 'siHoldLevTop', 'siHoldMstrTop'];

let _currentUser = null;

const _LS_KEY = 'btcStrategyInputs';

// ── Public API ─────────────────────────────────────────────────────────────────

function initAuth() {
    // Restore locally saved inputs before Supabase session resolves
    _loadLocalInputs();

    _setupModalListeners();
    _setupTabListeners();
    _setupSaveLoadListeners();
    _setupLocalAutoSave();

    // Listen for auth state changes
    dbOnAuthChange(session => {
        _currentUser = session ? session.user : null;
        _updateAuthUI(session);
    });

    // Check existing session on load
    dbGetSession().then(session => {
        _currentUser = session ? session.user : null;
        _updateAuthUI(session);
    }).catch(err => {
        console.warn('Auth session check failed:', err);
    });
}

function saveCurrentSettings(name) {
    if (!name || !name.trim()) {
        alert('Please enter a scenario name.');
        return;
    }
    const settings = _captureInputValues();
    dbSaveSettings(name.trim(), settings)
        .then(() => {
            _refreshSettingsDropdown();
            document.getElementById('siSettingsName').value = '';
        })
        .catch(err => alert('Save failed: ' + err.message));
}

function loadSettingsById(id) {
    if (!id) return;
    dbLoadSettings().then(rows => {
        const row = rows.find(r => String(r.id) === String(id));
        if (!row) return;
        _applyInputValues(row.settings);
        if (typeof renderStrategyDashboard === 'function') renderStrategyDashboard();
    }).catch(err => alert('Load failed: ' + err.message));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _captureInputValues() {
    const obj = {};
    SI_INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (SI_CHECKBOX_IDS.includes(id)) {
            obj[id] = el.checked;
        } else {
            obj[id] = el.value;
        }
    });
    return obj;
}

function _applyInputValues(settings) {
    if (!settings) return;
    SI_INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el || settings[id] === undefined) return;
        if (SI_CHECKBOX_IDS.includes(id)) {
            el.checked = !!settings[id];
        } else {
            el.value = settings[id];
        }
        // Fire change event so any listeners update (e.g. prediction line)
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// ── LocalStorage auto-save ────────────────────────────────────────────────────

function _saveLocalInputs() {
    try { localStorage.setItem(_LS_KEY, JSON.stringify(_captureInputValues())); } catch(e) {}
}

function _loadLocalInputs() {
    try {
        const raw = localStorage.getItem(_LS_KEY);
        if (raw) _applyInputValues(JSON.parse(raw));
    } catch(e) {}
}

function _setupLocalAutoSave() {
    SI_INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', _saveLocalInputs);
    });
}

function _updateAuthUI(session) {
    const btn = document.getElementById('authBtn');
    const saveRow = document.getElementById('siSaveRow');
    const portfolioPanel = document.getElementById('portfolioPanel');

    if (session && session.user) {
        if (btn) btn.textContent = 'Log out';
        const userEl = document.getElementById('headerUser');
        if (userEl) {
            const meta = session.user.user_metadata || {};
            const display = meta.full_name || meta.name || session.user.email || '';
            userEl.textContent = display;
            userEl.style.display = 'inline';
            userEl.title = session.user.email || display;
        }
        if (saveRow) saveRow.style.display = 'flex';
        if (portfolioPanel) portfolioPanel.style.display = '';
        _refreshSettingsDropdown();
        if (typeof renderPortfolioEntries === 'function') renderPortfolioEntries();
        if (typeof updateTradesOverlay === 'function') updateTradesOverlay();
        const alertsPanel = document.getElementById('alertsPanel');
        if (alertsPanel) alertsPanel.style.display = '';
        if (typeof renderAlerts === 'function') renderAlerts();
        // Pre-fill alert suggestions from lump sum triggers
        ['siT1Price','siT2Price','siT3Price'].forEach(id => {
            const val = document.getElementById(id)?.value;
            if (val && parseFloat(val) > 0) {
                // Just a hint — don't auto-create, let user decide
            }
        });
    } else {
        if (btn) btn.textContent = 'Log in';
        const userEl = document.getElementById('headerUser');
        if (userEl) { userEl.textContent = ''; userEl.style.display = 'none'; }
        if (saveRow) saveRow.style.display = 'none';
        if (portfolioPanel) portfolioPanel.style.display = 'none';
        const alertsPanel = document.getElementById('alertsPanel');
        if (alertsPanel) alertsPanel.style.display = 'none';
    }
}

function _refreshSettingsDropdown() {
    dbLoadSettings().then(rows => {
        const sel = document.getElementById('siLoadSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Load saved —</option>';
        rows.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name + ' (' + new Date(r.created_at).toLocaleDateString() + ')';
            sel.appendChild(opt);
        });
    }).catch(() => {});
}

function _setupModalListeners() {
    const btn   = document.getElementById('authBtn');
    const modal = document.getElementById('authModal');
    const close = document.getElementById('authModalClose');

    if (btn) {
        btn.addEventListener('click', () => {
            if (_currentUser) {
                // Logged in — show logout confirmation in modal
                _showLogoutConfirm(modal);
            } else {
                _showLoginForm(modal);
            }
        });
    }

    if (close) {
        close.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }

    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // Google OAuth
    const googleBtn = document.getElementById('authGoogleBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            googleBtn.disabled = true;
            try {
                await dbSignInWithGoogle();
                // Supabase redirects to Google — modal closes on return
            } catch (err) {
                const errEl = document.getElementById('authError') || document.getElementById('authErrorSignup');
                if (errEl) errEl.textContent = err.message;
                googleBtn.disabled = false;
            }
        });
    }

    // Login submit
    const loginBtn = document.getElementById('authSubmitLogin');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email    = document.getElementById('authEmail').value.trim();
            const password = document.getElementById('authPassword').value;
            const errEl    = document.getElementById('authError');
            errEl.textContent = '';
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in…';
            try {
                await dbSignIn(email, password);
                if (modal) modal.style.display = 'none';
                document.getElementById('authPassword').value = '';
            } catch (err) {
                errEl.textContent = err.message;
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Log in';
            }
        });
    }

    // Signup submit
    const signupBtn = document.getElementById('authSubmitSignup');
    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            const email    = document.getElementById('authEmailSignup').value.trim();
            const password = document.getElementById('authPasswordSignup').value;
            const errEl    = document.getElementById('authErrorSignup');
            errEl.textContent = '';
            signupBtn.disabled = true;
            signupBtn.textContent = 'Creating…';
            try {
                await dbSignUp(email, password);
                errEl.style.color = '#00cc66';
                errEl.textContent = 'Account created! Check your email to confirm.';
            } catch (err) {
                errEl.style.color = '';
                errEl.textContent = err.message;
            } finally {
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create account';
            }
        });
    }
}

function _showLoginForm(modal) {
    if (!modal) return;
    // Ensure login form content is visible, logout confirm is removed
    const inner = modal.querySelector('.auth-modal-inner');
    const existing = inner.querySelector('.auth-logout-confirm');
    if (existing) existing.remove();
    // Show all normal children
    Array.from(inner.children).forEach(el => el.style.display = '');
    // Reset to login tab
    const loginDiv = document.getElementById('authTabLogin');
    const signupDiv = document.getElementById('authTabSignup');
    if (loginDiv) loginDiv.style.display = '';
    if (signupDiv) signupDiv.style.display = 'none';
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'login');
    });
    modal.style.display = 'flex';
}

function _showLogoutConfirm(modal) {
    if (!modal) return;
    const inner = modal.querySelector('.auth-modal-inner');
    // Hide all normal children
    Array.from(inner.children).forEach(el => el.style.display = 'none');
    // Show close button
    const closeBtn = inner.querySelector('.auth-close');
    if (closeBtn) closeBtn.style.display = '';
    // Show brand
    const brand = inner.querySelector('.auth-brand');
    if (brand) brand.style.display = '';
    // Insert logout confirm UI
    const confirm = document.createElement('div');
    confirm.className = 'auth-logout-confirm';
    confirm.innerHTML = `
        <p>Are you sure you want to log out?</p>
        <div class="auth-logout-btns">
            <button class="logout-no">Cancel</button>
            <button class="logout-yes">Log out</button>
        </div>
    `;
    inner.appendChild(confirm);

    confirm.querySelector('.logout-no').addEventListener('click', () => {
        confirm.remove();
        modal.style.display = 'none';
    });
    confirm.querySelector('.logout-yes').addEventListener('click', () => {
        dbSignOut().catch(err => alert('Logout failed: ' + err.message));
        confirm.remove();
        modal.style.display = 'none';
    });

    modal.style.display = 'flex';
}

function _setupTabListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const which = tab.dataset.tab;
            const loginDiv  = document.getElementById('authTabLogin');
            const signupDiv = document.getElementById('authTabSignup');
            if (loginDiv)  loginDiv.style.display  = which === 'login'  ? '' : 'none';
            if (signupDiv) signupDiv.style.display = which === 'signup' ? '' : 'none';
        });
    });
}

function _setupSaveLoadListeners() {
    const saveBtn = document.getElementById('siSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('siSettingsName');
            saveCurrentSettings(nameEl ? nameEl.value : '');
        });
    }

    const loadSel = document.getElementById('siLoadSelect');
    if (loadSel) {
        loadSel.addEventListener('change', () => {
            loadSettingsById(loadSel.value);
        });
    }

    const deleteBtn = document.getElementById('siDeleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const loadSel = document.getElementById('siLoadSelect');
            const id = loadSel ? loadSel.value : '';
            if (!id) return;
            if (!confirm('Delete this saved scenario?')) return;
            dbDeleteSettings(id)
                .then(() => _refreshSettingsDropdown())
                .catch(err => alert('Delete failed: ' + err.message));
        });
    }
}
