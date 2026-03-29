// ── App Settings ───────────────────────────────────────────────────────────────
// Manages: theme, default currency, price refresh interval, notifications
// Persists to localStorage key 'btcAppSettings'

const _SETTINGS_KEY = 'btcAppSettings';

let _settings = {
    theme:            'dark',
    currency:         'CHF',
    updateInterval:   5,      // minutes; 0 = off
    notifications:    true
};

let _pollId = null;

// ── Public API ─────────────────────────────────────────────────────────────────

function initSettings() {
    _loadSettings();
    _buildSettingsUI();
    _applyTheme(_settings.theme, true);
    _syncCurrencyButtons(_settings.currency);
    _syncIntervalSelect();
    _syncNotificationsToggle();
    _wireSettingsEvents();
}

// Called by main.js after charts are built to kick off polling
function startPricePolling(pollFn) {
    _pollFn = pollFn;
    _restartPoll();
}

// Exposed so alerts.js can check before firing browser notification
function notificationsEnabled() {
    return _settings.notifications;
}

// ── Internal state ─────────────────────────────────────────────────────────────

let _pollFn = null;

function _restartPoll() {
    if (_pollId) clearInterval(_pollId);
    _pollId = null;
    if (_settings.updateInterval > 0 && _pollFn) {
        _pollId = setInterval(_pollFn, _settings.updateInterval * 60 * 1000);
    }
}

function _loadSettings() {
    try {
        const raw = localStorage.getItem(_SETTINGS_KEY);
        if (raw) _settings = { ..._settings, ...JSON.parse(raw) };
    } catch(e) {}
}

function _saveSettings() {
    try { localStorage.setItem(_SETTINGS_KEY, JSON.stringify(_settings)); } catch(e) {}
}

// ── Theme ──────────────────────────────────────────────────────────────────────

function _applyTheme(theme, updateCharts = true) {
    document.documentElement.dataset.theme = theme;
    _settings.theme = theme;

    const btn = document.getElementById('settingsThemeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀ Light mode' : '☾ Dark mode';

    if (updateCharts) _updateAllChartTheme(theme);
}

function _updateAllChartTheme(theme) {
    if (typeof Chart === 'undefined') return;
    const light  = theme === 'light';
    const tick   = light ? '#888'    : '#3a3a5a';
    const grid   = light ? '#e4e4f0' : '#111120';
    const tipBg  = light ? '#ffffff' : '#131320';
    const tipBdr = light ? '#c0c4da' : '#2a2a42';
    const tipTtl = light ? '#888'    : '#666';
    const tipBdy = light ? '#222'    : '#ccc';

    document.querySelectorAll('canvas').forEach(canvas => {
        const ch = Chart.getChart(canvas);
        if (!ch) return;

        // Update scale colors
        for (const scale of Object.values(ch.options.scales ?? {})) {
            if (scale.ticks) scale.ticks.color = tick;
            if (scale.grid)  scale.grid.color  = grid;
        }

        // Update tooltip colors
        const tooltip = ch.options.plugins?.tooltip;
        if (tooltip) {
            tooltip.backgroundColor = tipBg;
            tooltip.borderColor     = tipBdr;
            tooltip.titleColor      = tipTtl;
            tooltip.bodyColor       = tipBdy;
        }

        // Legend labels
        const legend = ch.options.plugins?.legend?.labels;
        if (legend) legend.color = light ? '#666' : '#666';

        ch.update('none');
    });
}

// ── Build UI ───────────────────────────────────────────────────────────────────

function _buildSettingsUI() {
    // Cog button in header
    if (!document.getElementById('settingsBtn')) {
        const btn = document.createElement('button');
        btn.id        = 'settingsBtn';
        btn.className = 'settings-btn';
        btn.innerHTML = '&#9881;';   // ⚙
        btn.title     = 'Settings';
        const headerRight = document.querySelector('.header-right');
        const authBtn     = document.getElementById('authBtn');
        if (headerRight && authBtn) headerRight.insertBefore(btn, authBtn);
        else if (authBtn) authBtn.parentNode.insertBefore(btn, authBtn);
    }

    // Settings modal
    if (document.getElementById('settingsModal')) return;

    const modal = document.createElement('div');
    modal.id        = 'settingsModal';
    modal.className = 'settings-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="settings-inner">
            <button id="settingsClose" class="settings-close">×</button>
            <div class="settings-title">Preferences</div>

            <div class="settings-section">
                <div class="settings-section-title">Appearance</div>
                <div class="settings-row">
                    <span>Theme</span>
                    <button id="settingsThemeToggle" class="small-btn">☀ Light mode</button>
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">Currency</div>
                <div class="settings-row">
                    <span>Default display currency</span>
                    <div class="settings-currency-group">
                        <button class="settings-curr-btn" data-currency="USD">USD</button>
                        <button class="settings-curr-btn" data-currency="CHF">CHF</button>
                        <button class="settings-curr-btn" data-currency="CZK">CZK</button>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">Live Data</div>
                <div class="settings-row">
                    <span>Price refresh interval</span>
                    <select id="settingsInterval" class="settings-select">
                        <option value="1">Every 1 min</option>
                        <option value="5">Every 5 min</option>
                        <option value="15">Every 15 min</option>
                        <option value="30">Every 30 min</option>
                        <option value="0">Off</option>
                    </select>
                </div>
                <div class="settings-row">
                    <span>Browser notifications</span>
                    <label class="settings-toggle">
                        <input type="checkbox" id="settingsNotifications">
                        <span class="settings-toggle-track"></span>
                    </label>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ── Sync UI state with current settings ───────────────────────────────────────

function _syncCurrencyButtons(currency) {
    document.querySelectorAll('.settings-curr-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.currency === currency);
    });
}

function _syncIntervalSelect() {
    const sel = document.getElementById('settingsInterval');
    if (sel) sel.value = String(_settings.updateInterval);
}

function _syncNotificationsToggle() {
    const el = document.getElementById('settingsNotifications');
    if (el) el.checked = _settings.notifications;
}

// ── Event wiring ───────────────────────────────────────────────────────────────

function _wireSettingsEvents() {
    const btn   = document.getElementById('settingsBtn');
    const modal = document.getElementById('settingsModal');
    const close = document.getElementById('settingsClose');

    btn?.addEventListener('click', () => {
        _syncCurrencyButtons(_settings.currency);
        _syncIntervalSelect();
        _syncNotificationsToggle();
        modal.style.display = 'flex';
    });

    close?.addEventListener('click', () => { modal.style.display = 'none'; });
    modal?.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    // Theme toggle
    document.getElementById('settingsThemeToggle')?.addEventListener('click', () => {
        const next = _settings.theme === 'dark' ? 'light' : 'dark';
        _applyTheme(next, true);
        _saveSettings();
    });

    // Currency buttons in settings
    document.querySelectorAll('.settings-curr-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const currency = btn.dataset.currency;
            _settings.currency = currency;
            _saveSettings();
            _syncCurrencyButtons(currency);

            if (typeof switchCurrency === 'function') await switchCurrency(currency);
            modal.style.display = 'none';
        });
    });

    // Interval selector
    document.getElementById('settingsInterval')?.addEventListener('change', function() {
        _settings.updateInterval = +this.value;
        _saveSettings();
        _restartPoll();
    });

    // Notifications toggle
    document.getElementById('settingsNotifications')?.addEventListener('change', function() {
        _settings.notifications = this.checked;
        _saveSettings();
        // Request permission if enabling
        if (this.checked && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });
}
