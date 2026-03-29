// ── Price Alerts ───────────────────────────────────────────────────────────────
// Depends on: db.js (dbSaveAlert, dbGetAlerts, dbDeleteAlert, dbMarkAlertFired)
//             main.js globals: pricesUSD, currencyRate, currencySymbol

async function initAlerts() {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    _buildAlertsUI();
    _wireAlertsForm();
}

function checkAlerts(currentPriceUSD) {
    // Called from the polling loop each time price updates
    if (typeof dbGetAlerts !== 'function') return;
    dbGetAlerts().then(alerts => {
        alerts.forEach(alert => {
            if (alert.fired) return;
            const triggered = alert.direction === 'above'
                ? currentPriceUSD >= alert.price_usd
                : currentPriceUSD <= alert.price_usd;
            if (triggered) {
                _fireAlert(alert, currentPriceUSD);
                dbMarkAlertFired(alert.id).catch(() => {});
            }
        });
    }).catch(() => {});
}

function _fireAlert(alert, currentPriceUSD) {
    const sym = typeof currencySymbol !== 'undefined' ? currencySymbol : '$';
    const rate = typeof currencyRate !== 'undefined' ? currencyRate : 1;
    const msg = `BTC is ${alert.direction} ${fmtPrice(alert.price_usd * rate)} — now ${fmtPrice(currentPriceUSD * rate)}`;

    // Browser notification (respect user preference)
    const notifOk = typeof notificationsEnabled === 'function' ? notificationsEnabled() : true;
    if (notifOk && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('BTC Alert: ' + alert.label, {
            body: msg,
            icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png'
        });
    }

    // In-page toast
    _showToast('🔔 ' + alert.label + ' — ' + msg);

    // Re-render alerts list
    if (typeof renderAlerts === 'function') renderAlerts();
}

function _showSignalToast(message) {
    let toast = document.getElementById('signalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'signalToast';
        toast.className = 'alert-toast';
        toast.style.cssText = 'bottom:60px'; // stack above price alert toast
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 8000);
}

function _showToast(message) {
    let toast = document.getElementById('alertToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'alertToast';
        toast.className = 'alert-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 6000);
}

function renderAlerts() {
    if (typeof dbGetAlerts !== 'function') return;
    dbGetAlerts().then(alerts => {
        const tbody = document.getElementById('alertsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!alerts.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#444;padding:12px">No alerts set</td></tr>';
            return;
        }
        alerts.forEach(a => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${a.label}</td>
                <td class="btc-cell">${fmtPrice(a.price_usd * (typeof currencyRate !== 'undefined' ? currencyRate : 1))}</td>
                <td>${a.direction === 'above' ? '▲ Above' : '▼ Below'}</td>
                <td style="color:${a.fired ? '#00cc66' : '#555'}">${a.fired ? 'Fired' : 'Watching'}</td>
                <td style="display:flex;gap:4px">
                    ${a.fired ? `<button class="small-btn alert-rearm-btn" data-id="${a.id}">Re-arm</button>` : ''}
                    <button class="small-btn danger alert-del-btn" data-id="${a.id}">×</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.alert-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dbDeleteAlert(btn.dataset.id).then(() => renderAlerts()).catch(() => {});
            });
        });
        tbody.querySelectorAll('.alert-rearm-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dbRearmAlert(btn.dataset.id).then(() => renderAlerts()).catch(() => {});
            });
        });
    }).catch(() => {});
}

function _buildAlertsUI() {
    // Insert alerts panel after portfolio panel
    const existing = document.getElementById('alertsPanel');
    if (existing) return;
    const panel = document.createElement('div');
    panel.id = 'alertsPanel';
    panel.className = 'panel';
    panel.style.display = 'none';
    panel.innerHTML = `
        <div class="panel-header">
            <div class="panel-title">Price Alerts</div>
        </div>
        <div class="si-triggers" style="margin-bottom:14px">
            <div class="si-triggers-title">Set Alert</div>
            <div class="si-trigger-row">
                <input type="text" id="alertLabel" placeholder="Label (e.g. Buy target)" class="alert-input" style="width:160px">
                <span>BTC</span>
                <select id="alertDirection" class="alert-input">
                    <option value="below">drops below</option>
                    <option value="above">rises above</option>
                </select>
                <input type="number" id="alertPrice" placeholder="50000" step="1000" class="alert-input" style="width:100px">
                <button id="alertAddBtn" class="small-btn">Add Alert</button>
                <span id="alertError" style="color:#ff5555;font-size:0.72rem"></span>
            </div>
        </div>
        <div class="port-table-wrap">
            <table class="si-table">
                <thead><tr><th>Label</th><th>Price</th><th>Direction</th><th>Status</th><th></th></tr></thead>
                <tbody id="alertsTableBody"></tbody>
            </table>
        </div>
    `;
    const portfolioPanel = document.getElementById('portfolioPanel');
    if (portfolioPanel && portfolioPanel.parentNode) {
        portfolioPanel.parentNode.insertBefore(panel, portfolioPanel.nextSibling);
    } else {
        document.querySelector('.container').appendChild(panel);
    }
}

function _wireAlertsForm() {
    document.addEventListener('click', e => {
        if (e.target.id !== 'alertAddBtn') return;
        const label     = document.getElementById('alertLabel')?.value?.trim();
        const direction = document.getElementById('alertDirection')?.value;
        const priceVal  = parseFloat(document.getElementById('alertPrice')?.value);
        const errEl     = document.getElementById('alertError');
        if (errEl) errEl.textContent = '';
        if (!label)          { if (errEl) errEl.textContent = 'Enter a label'; return; }
        if (!priceVal || priceVal <= 0) { if (errEl) errEl.textContent = 'Enter a valid price'; return; }
        dbSaveAlert(label, priceVal, direction)
            .then(() => {
                document.getElementById('alertLabel').value = '';
                document.getElementById('alertPrice').value = '';
                renderAlerts();
            })
            .catch(err => { if (errEl) errEl.textContent = err.message; });
    });
}
