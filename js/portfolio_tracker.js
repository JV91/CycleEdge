// ── Portfolio Tracker ──────────────────────────────────────────────────────────
// Depends on: db.js (dbAddEntry, dbGetEntries, dbDeleteEntry, dbUpdateEntry,
//                    dbRecordSnapshot, dbGetSnapshots)
//             main.js globals: pricesUSD, dates, predLineUSD, currencyRate,
//                              currencySymbol, priceChart

let _portValueChart = null;
let _editingId      = null;

// ── Public API ─────────────────────────────────────────────────────────────────

function initPortfolioTracker() {
    _buildPortfolioPanelHTML();
    _wireAddEntryForm();
}

function renderPortfolioEntries() {
    _updateCurrencyLabels();
    dbGetEntries().then(entries => {
        _renderTable(entries);
        _renderStats(entries);
        _renderPortfolioHistory(entries);
        updateAvgEntryAnnotation(entries);
    }).catch(err => console.warn('Portfolio load failed:', err));

    if (typeof updateTradesOverlay === 'function') updateTradesOverlay();
}

// ── Avg entry annotation on main price chart ───────────────────────────────────

function updateAvgEntryAnnotation(entries) {
    if (typeof priceChart === 'undefined' || !priceChart) return;

    const buysBTC   = entries.filter(e => e.asset === 'BTC' && e.type === 'buy');
    const btcBought = buysBTC.reduce((s, e) =>
        s + (e.price_usd > 0 ? Number(e.amount_currency) / Number(e.price_usd) : 0), 0);
    const totalCost = buysBTC.reduce((s, e) => s + Number(e.amount_currency), 0);
    const avgEntryUSD = btcBought > 0 ? totalCost / btcBought : 0;

    const rate = typeof currencyRate   !== 'undefined' ? currencyRate   : 1;
    const sym  = typeof currencySymbol !== 'undefined' ? currencySymbol : '$';

    if (avgEntryUSD > 0) {
        const yVal = avgEntryUSD * rate;
        priceChart.options.plugins.annotation.annotations.avgEntry = {
            type: 'line',
            yMin: yVal, yMax: yVal,
            borderColor: '#f7931a88',
            borderWidth: 1.5,
            borderDash: [8, 4],
            label: {
                display: true,
                content: `My Avg Entry: ${sym}${Math.round(yVal).toLocaleString()}`,
                position: 'end',
                color: '#f7931acc',
                font: { size: 10 },
                backgroundColor: '#0e0e18ee',
                padding: { x: 5, y: 3 }
            }
        };
    } else {
        delete priceChart.options.plugins.annotation.annotations.avgEntry;
    }
    priceChart.update('none');
}

// ── Build HTML ─────────────────────────────────────────────────────────────────

function _buildPortfolioPanelHTML() {
    const panel = document.getElementById('portfolioPanel');
    if (!panel) return;

    panel.innerHTML = `
    <div class="panel-header">
        <div class="panel-title">Real Portfolio — Actual Trades &amp; Price Deviation</div>
        <div style="display:flex;gap:6px;position:relative">
            <div style="position:relative">
                <button id="portImportDropBtn" class="small-btn" style="padding-right:20px">Import ▾</button>
                <div id="portImportMenu" style="display:none;position:absolute;top:100%;right:0;margin-top:3px;background:#131320;border:1px solid #2a2a42;border-radius:6px;z-index:200;min-width:170px;overflow:hidden">
                    <button id="portImportKrakenBtn" class="small-btn" style="display:block;width:100%;text-align:left;border-radius:0;border:none;border-bottom:1px solid #1a1a2e">Import Kraken CSV</button>
                    <button id="portPasteKrakenBtn" class="small-btn" style="display:block;width:100%;text-align:left;border-radius:0;border:none">Paste from Kraken</button>
                </div>
            </div>
            <button id="portExportBtn" class="small-btn">Export CSV</button>
            <button id="portDeleteAllBtn" class="small-btn danger">Delete All</button>
        </div>
    </div>

    <!-- Stats row -->
    <div class="port-stats-row" id="portStatsRow">
        <div class="port-stat"><span class="port-sl">Total Invested</span><span class="port-sv" id="portTotalInvested">—</span></div>
        <div class="port-stat"><span class="port-sl">BTC Held</span><span class="port-sv hi" id="portBTCHeld">—</span></div>
        <div class="port-stat"><span class="port-sl">Avg Entry</span><span class="port-sv" id="portAvgEntry">—</span></div>
        <div class="port-stat"><span class="port-sl">Current Value</span><span class="port-sv" id="portCurrentValue">—</span></div>
        <div class="port-stat"><span class="port-sl">Unrealized P&amp;L</span><span class="port-sv" id="portPnl">—</span></div>
        <div class="port-stat"><span class="port-sl">Realized P&amp;L</span><span class="port-sv" id="portRealizedPnl">—</span></div>
        <div class="port-stat"><span class="port-sl">Total P&amp;L</span><span class="port-sv" id="portTotalPnl">—</span></div>
    </div>

    <!-- Add / Edit entry form -->
    <div class="port-add-form" id="portAddForm">
        <div class="port-add-title" id="portFormTitle">Add Trade</div>
        <div class="port-add-row">
            <div class="port-field">
                <label>Date</label>
                <input type="date" id="portDate">
            </div>
            <div class="port-field">
                <label>Asset</label>
                <select id="portAsset">
                    <option value="BTC">BTC</option>
                    <option value="BTC_LEV">BTC Leveraged</option>
                    <option value="MSTR">MSTR</option>
                </select>
            </div>
            <div class="port-field">
                <label>Type</label>
                <select id="portType">
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                </select>
            </div>
            <div class="port-field">
                <label>Amount (<span id="portCurrLabel">USD</span>)</label>
                <input type="number" id="portAmountCurrency" placeholder="0" min="0" step="0.01">
            </div>
            <div class="port-field">
                <label>Price at time (USD)</label>
                <input type="number" id="portPriceUSD" placeholder="0" min="0" step="100">
            </div>
            <div class="port-field port-field-wide">
                <label>Notes</label>
                <input type="text" id="portNotes" placeholder="optional">
            </div>
            <div class="port-field port-field-btn" style="flex-direction:row;gap:6px">
                <button id="portAddBtn" class="small-btn">Add</button>
                <button id="portCancelEditBtn" class="small-btn" style="display:none">Cancel</button>
            </div>
        </div>
        <div id="portAddError" class="port-error"></div>
    </div>

    <!-- Entries table -->
    <div class="port-table-wrap">
        <table class="si-table" id="portTable">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Asset</th>
                    <th>Type</th>
                    <th>Amount (<span id="portCurrLabelTh">USD</span>)</th>
                    <th>Price USD</th>
                    <th>BTC equiv.</th>
                    <th>Notes</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="portTableBody"></tbody>
        </table>
        <div id="portEmpty" style="display:none;text-align:center;padding:24px;color:#444;font-size:0.8rem">No trades recorded yet.</div>
    </div>

    <!-- Portfolio value history chart -->
    <div class="port-dev-section" id="portHistSection" style="display:none">
        <div class="port-dev-title" id="portHistTitle">Portfolio Value vs Total Invested</div>
        <div class="port-dev-chart-box" style="height:220px">
            <canvas id="portValueChart"></canvas>
        </div>
    </div>

    `;

    document.getElementById('portExportBtn').addEventListener('click', () => {
        dbGetEntries()
            .then(entries => _exportPortfolioCSV(entries))
            .catch(err => alert('Export failed: ' + err.message));
    });

    const importMenu = document.getElementById('portImportMenu');
    document.getElementById('portImportDropBtn').addEventListener('click', e => {
        e.stopPropagation();
        importMenu.style.display = importMenu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { importMenu.style.display = 'none'; });

    document.getElementById('portImportKrakenBtn').addEventListener('click', () => { importMenu.style.display = 'none'; _openKrakenImport(); });
    document.getElementById('portPasteKrakenBtn').addEventListener('click', () => { importMenu.style.display = 'none'; _pasteKrakenImport(); });

    document.getElementById('portDeleteAllBtn').addEventListener('click', async () => {
        if (!confirm('Delete ALL trades? This cannot be undone.')) return;
        try {
            await dbDeleteAllEntries();
            renderPortfolioEntries();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    });

    document.getElementById('portCancelEditBtn').addEventListener('click', _resetEditMode);
}

// ── CSV Export ─────────────────────────────────────────────────────────────────

function _exportPortfolioCSV(entries) {
    if (!entries.length) { alert('No trades to export.'); return; }
    const currName = (_currSym().trim() || 'USD');
    const header = ['Date', 'Asset', 'Type', `Amount (${currName})`, 'Price USD', 'BTC Equiv', 'Notes'];
    const rows = entries.map(e => {
        const btcEquiv = e.asset === 'BTC' && e.price_usd > 0
            ? (e.amount_currency / e.price_usd).toFixed(8)
            : '';
        return [
            e.date,
            e.asset,
            e.type,
            Number(e.amount_currency).toFixed(2),
            Number(e.price_usd).toFixed(2),
            btcEquiv,
            (e.notes || '').replace(/,/g, ';')
        ];
    });
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `portfolio_trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Portfolio value history chart ──────────────────────────────────────────────

function _renderPortfolioHistory(entries) {
    const section = document.getElementById('portHistSection');
    const canvas  = document.getElementById('portValueChart');
    if (!section || !canvas) return;

    if (typeof dates === 'undefined' || !dates || !dates.length) return;
    if (typeof pricesUSD === 'undefined' || !pricesUSD || !pricesUSD.length) return;

    const btcEntries = entries.filter(e => e.asset === 'BTC');
    if (!btcEntries.length) { section.style.display = 'none'; return; }

    const sorted       = [...btcEntries].sort((a, b) => a.date.localeCompare(b.date));
    const firstTradeTs = new Date(sorted[0].date).getTime();
    const tradeTimes   = sorted.map(e => new Date(e.date).getTime());

    const rate = _currRate();
    let tradeIdx = 0, cumulBTC = 0, cumulInvested = 0;
    const valueHistory = [], investedHistory = [];

    for (let i = 0; i < dates.length; i++) {
        if (dates[i] < firstTradeTs) continue;

        while (tradeIdx < sorted.length && tradeTimes[tradeIdx] <= dates[i]) {
            const e   = sorted[tradeIdx];
            // price_usd already encodes the rate at import time; use direct division
            const btc = e.price_usd > 0 ? Number(e.amount_currency) / Number(e.price_usd) : 0;
            if (e.type === 'buy') {
                cumulBTC      += btc;
                cumulInvested += Number(e.amount_currency);
            } else {
                cumulBTC = Math.max(0, cumulBTC - btc);
            }
            tradeIdx++;
        }

        if (cumulBTC > 0 || cumulInvested > 0) {
            valueHistory.push({ x: dates[i], y: Math.round(cumulBTC * pricesUSD[i] * rate) });
            investedHistory.push({ x: dates[i], y: cumulInvested });
        }
    }

    if (valueHistory.length < 2) { section.style.display = 'none'; return; }
    section.style.display = '';

    const sym = _currSym().trim() || 'USD';
    const title = document.getElementById('portHistTitle');
    if (title) title.textContent = `Portfolio Value vs Total Invested (${sym})`;

    if (_portValueChart) {
        _portValueChart.data.datasets[0].data = valueHistory;
        _portValueChart.data.datasets[1].data = investedHistory;
        _portValueChart.data.datasets[0].label = `Portfolio Value (${sym})`;
        _portValueChart.data.datasets[1].label = `Total Invested (${sym})`;
        _portValueChart.update('none');
        return;
    }

    if (typeof Chart === 'undefined') return;
    _portValueChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                {
                    label: `Portfolio Value (${sym})`,
                    data: valueHistory,
                    borderColor: '#f7931a',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false
                },
                {
                    label: `Total Invested (${sym})`,
                    data: investedHistory,
                    borderColor: '#5577ff',
                    borderWidth: 1.5,
                    borderDash: [6, 3],
                    pointRadius: 0,
                    tension: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#666', font: { size: 11 } }
                },
                tooltip: {
                    backgroundColor: '#131320',
                    borderColor: '#2a2a42',
                    borderWidth: 1,
                    titleColor: '#666',
                    bodyColor: '#ccc',
                    padding: 8,
                    callbacks: {
                        title: items => new Date(items[0].parsed.x).toLocaleDateString(),
                        label: ctx => ` ${ctx.dataset.label}: ${_fmtCurr(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month' },
                    grid: { color: '#111120' },
                    ticks: { color: '#3a3a5a', font: { size: 10 }, maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: '#111120' },
                    ticks: {
                        color: '#3a3a5a',
                        font: { size: 10 },
                        callback: v => _fmtCurr(v)
                    }
                }
            }
        }
    });
}

// ── Table rendering ───────────────────────────────────────────────────────────

function _renderTable(entries) {
    const tbody = document.getElementById('portTableBody');
    const empty = document.getElementById('portEmpty');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!entries.length) {
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    entries.forEach(e => {
        const btcEquiv = e.asset === 'BTC' && e.price_usd > 0
            ? (e.amount_currency / e.price_usd).toFixed(6)
            : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${e.date}</td>
            <td class="btc-cell">${e.asset}</td>
            <td class="${e.type === 'buy' ? 'buy-cell' : 'sell-cell'}">${e.type.toUpperCase()}</td>
            <td>${_fmtCurr(e.amount_currency)}</td>
            <td>$${Math.round(Number(e.price_usd)).toLocaleString()}</td>
            <td class="btc-cell">${btcEquiv}</td>
            <td class="note-cell">${e.notes || ''}</td>
            <td style="display:flex;gap:4px">
                <button class="small-btn port-edit-btn" data-id="${e.id}" title="Edit">✎</button>
                <button class="small-btn danger port-del-btn" data-id="${e.id}">×</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.port-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!confirm('Delete this entry?')) return;
            dbDeleteEntry(btn.dataset.id)
                .then(() => renderPortfolioEntries())
                .catch(err => alert('Delete failed: ' + err.message));
        });
    });

    tbody.querySelectorAll('.port-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            dbGetEntries().then(all => {
                const e = all.find(x => String(x.id) === String(id));
                if (!e) return;
                _editingId = id;
                document.getElementById('portDate').value           = e.date;
                document.getElementById('portAsset').value          = e.asset;
                document.getElementById('portType').value           = e.type;
                document.getElementById('portAmountCurrency').value = e.amount_currency;
                document.getElementById('portPriceUSD').value       = e.price_usd;
                document.getElementById('portNotes').value          = e.notes || '';
                document.getElementById('portAddBtn').textContent           = 'Update';
                document.getElementById('portCancelEditBtn').style.display  = '';
                document.getElementById('portFormTitle').textContent         = 'Edit Trade';
                document.getElementById('portAddForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }).catch(err => alert('Load failed: ' + err.message));
        });
    });
}

// ── Edit mode helpers ─────────────────────────────────────────────────────────

function _resetEditMode() {
    _editingId = null;
    document.getElementById('portAddBtn').textContent           = 'Add';
    document.getElementById('portCancelEditBtn').style.display  = 'none';
    document.getElementById('portFormTitle').textContent         = 'Add Trade';
    document.getElementById('portAmountCurrency').value = '';
    document.getElementById('portPriceUSD').value       = '';
    document.getElementById('portNotes').value          = '';
    const errEl = document.getElementById('portAddError');
    if (errEl) errEl.textContent = '';
}

// ── Currency label helpers ────────────────────────────────────────────────────

function _updateCurrencyLabels() {
    const sym  = _currSym();
    const name = sym.trim().replace(/\s/g, '') || 'USD';
    ['portCurrLabel', 'portCurrLabelTh'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
    });
}

function _currSym()  { return typeof currencySymbol !== 'undefined' ? currencySymbol : '$'; }
function _currRate() { return typeof currencyRate   !== 'undefined' ? currencyRate   : 1;  }

function _fmtCurr(n) {
    const sym = _currSym();
    return sym + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Summary stats ─────────────────────────────────────────────────────────────

function _renderStats(entries) {
    const rate     = _currRate();
    const buysBTC  = entries.filter(e => e.asset === 'BTC' && e.type === 'buy');
    const sellsBTC = entries.filter(e => e.asset === 'BTC' && e.type === 'sell');

    // Total invested in buys (in display currency)
    const totalInvested = buysBTC.reduce((sum, e) => sum + Number(e.amount_currency), 0);

    // BTC amounts — derived from stored price_usd which already has rate baked in at import time
    // Use amount_currency / price_usd directly (rate is encoded in price_usd)
    const btcBought = buysBTC.reduce((sum, e) =>
        sum + (e.price_usd > 0 ? Number(e.amount_currency) / Number(e.price_usd) : 0), 0);
    const btcSold = sellsBTC.reduce((sum, e) =>
        sum + (e.price_usd > 0 ? Number(e.amount_currency) / Number(e.price_usd) : 0), 0);
    const btcHeld = Math.max(0, btcBought - btcSold);

    // Avg cost per BTC in display currency (used for realized P&L)
    const avgCostPerBTC = btcBought > 0 ? totalInvested / btcBought : 0;

    // avgEntry in USD/BTC (for display; divide by rate to convert from display currency)
    const avgEntryUSD = avgCostPerBTC > 0 && rate > 0 ? avgCostPerBTC / rate : 0;

    const currentPriceUSD = (typeof pricesUSD !== 'undefined' && pricesUSD.length)
        ? pricesUSD[pricesUSD.length - 1]
        : 0;

    // Unrealized P&L (on current holdings)
    const currentValue  = btcHeld * currentPriceUSD * rate;
    const unrealCost    = btcHeld * avgCostPerBTC;
    const unrealPnl     = currentValue - unrealCost;
    const unrealPnlPct  = unrealCost > 0 ? (unrealPnl / unrealCost) * 100 : 0;

    // Realized P&L (average cost method)
    // For each BTC sold, cost basis = btcSold * avgCostPerBTC
    // Proceeds = sum of sell amount_currency
    const totalSellProceeds = sellsBTC.reduce((sum, e) => sum + Number(e.amount_currency), 0);
    const realizedCostBasis = btcSold * avgCostPerBTC;
    const realizedPnl       = totalSellProceeds > 0 ? totalSellProceeds - realizedCostBasis : null;
    const realizedPnlPct    = realizedCostBasis > 0 ? ((totalSellProceeds - realizedCostBasis) / realizedCostBasis) * 100 : 0;

    _setPortStat('portTotalInvested', _fmtCurr(totalInvested));
    _setPortStat('portBTCHeld', btcHeld.toFixed(6) + ' BTC');
    _setPortStat('portAvgEntry', avgEntryUSD > 0 ? _fmtCurr(avgEntryUSD * _currRate()) : '—');
    _setPortStat('portCurrentValue', currentPriceUSD > 0 && btcHeld > 0 ? _fmtCurr(currentValue) : '—');

    // Unrealized P&L
    const pnlEl = document.getElementById('portPnl');
    if (pnlEl) {
        if (btcHeld > 0 && unrealCost > 0 && currentPriceUSD > 0) {
            pnlEl.textContent = (unrealPnl >= 0 ? '+' : '') + _fmtCurr(unrealPnl)
                + ' (' + (unrealPnl >= 0 ? '+' : '') + unrealPnlPct.toFixed(1) + '%)';
            pnlEl.style.color = unrealPnl >= 0 ? '#00cc66' : '#ff5555';
        } else {
            pnlEl.textContent = '—';
            pnlEl.style.color = '';
        }
    }

    // Realized P&L
    const realEl = document.getElementById('portRealizedPnl');
    if (realEl) {
        if (realizedPnl !== null) {
            realEl.textContent = (realizedPnl >= 0 ? '+' : '') + _fmtCurr(realizedPnl)
                + ' (' + (realizedPnl >= 0 ? '+' : '') + realizedPnlPct.toFixed(1) + '%)';
            realEl.style.color = realizedPnl >= 0 ? '#00cc66' : '#ff5555';
        } else {
            realEl.textContent = '—';
            realEl.style.color = '';
        }
    }

    // Total P&L = realized + unrealized
    const totalPnlEl = document.getElementById('portTotalPnl');
    if (totalPnlEl) {
        const hasUnreal = btcHeld > 0 && unrealCost > 0 && currentPriceUSD > 0;
        const hasReal   = realizedPnl !== null;
        if (hasUnreal || hasReal) {
            const totalPnl    = (hasUnreal ? unrealPnl : 0) + (hasReal ? realizedPnl : 0);
            const totalCost   = totalInvested;
            const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
            totalPnlEl.textContent = (totalPnl >= 0 ? '+' : '') + _fmtCurr(totalPnl)
                + ' (' + (totalPnl >= 0 ? '+' : '') + totalPnlPct.toFixed(1) + '%)';
            totalPnlEl.style.color = totalPnl >= 0 ? '#00cc66' : '#ff5555';
        } else {
            totalPnlEl.textContent = '—';
            totalPnlEl.style.color = '';
        }
    }
}

function _setPortStat(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ── Deviation chart ───────────────────────────────────────────────────────────

// ── Trades overlay on main price chart ────────────────────────────────────────

function updateTradesOverlay() {
    if (typeof priceChart === 'undefined' || !priceChart) return;
    dbGetEntries().then(entries => {
        const buys  = entries.filter(e => e.asset === 'BTC' && e.type === 'buy');
        const sells = entries.filter(e => e.asset === 'BTC' && e.type === 'sell');
        const sym   = _currSym();
        const toPoint = e => ({
            x:         new Date(e.date).getTime(),
            y:         e.price_usd * (typeof currencyRate !== 'undefined' ? currencyRate : 1),
            amount:    Number(e.amount_currency),
            amountFmt: sym + Number(e.amount_currency).toLocaleString(undefined, { maximumFractionDigits: 0 })
        });
        priceChart.data.datasets[7].data = buys.map(toPoint);
        priceChart.data.datasets[8].data = sells.map(toPoint);
        priceChart.update('none');
    }).catch(() => {});
}

// ── Kraken CSV Importer ───────────────────────────────────────────────────────

function _openKrakenImport() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.csv,text/csv';
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const rows = _parseKrakenCSV(evt.target.result);
                if (!rows.length) {
                    alert('No BTC trades found in this file.\n\nMake sure to export from Kraken History → Trades and that the file contains BTC trades.');
                    return;
                }
                // Fetch existing entries to detect duplicates before showing preview
                dbGetEntries().then(existing => {
                    // Primary: set of Kraken IDs already stored in notes as "#XXXX"
                    const importedIds = new Set();
                    existing.forEach(e => {
                        const m = (e.notes || '').match(/#([A-Z0-9]+)$/);
                        if (m) importedIds.add(m[1]);
                    });

                    // Fallback: fingerprint by date+type+cost for trades without stored IDs
                    // (covers trades imported before ID tracking was added)
                    const importedFingerprints = new Set();
                    existing.forEach(e => {
                        importedFingerprints.add(
                            `${e.date}|${e.type}|${Math.round(Number(e.amount_currency) * 100)}`
                        );
                    });

                    rows.forEach(r => {
                        const byId = r.krakenId && importedIds.has(r.krakenId);
                        const byFingerprint = importedFingerprints.has(
                            `${r.date}|${r.type}|${Math.round(r.cost * 100)}`
                        );
                        r.isDuplicate = byId || byFingerprint;
                    });
                    _showKrakenPreview(rows);
                }).catch(() => {
                    _showKrakenPreview(rows);
                });
            } catch (err) {
                alert('Failed to parse CSV: ' + err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    });
    input.click();
}

// Strip embedded currency/unit suffix and thousands commas, return float
// e.g. "57,150.0CHF" → 57150, "0.01491654BTC" → 0.01491654, "5,010CHF" → 5010
function _krakenParseNum(s) {
    if (!s) return 0;
    return parseFloat(
        String(s).replace(/^"|"$/g, '').replace(/[A-Za-z\s]+$/, '').replace(/,/g, '')
    ) || 0;
}

// Extract currency suffix from a value string, e.g. "852.48CHF" → "CHF"
function _krakenExtractCurrency(s) {
    if (!s) return '';
    const m = String(s).replace(/^"|"$/g, '').match(/([A-Za-z]+)$/);
    return m ? m[1].toUpperCase() : '';
}

function _parseKrakenCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    // Auto-detect separator: TSV (clipboard copy) or CSV (file export)
    const sep = (lines[0].match(/\t/g) || []).length >= (lines[0].match(/,/g) || []).length
        ? '\t' : ',';

    const rawHeader = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
    const findCol   = (...names) => rawHeader.findIndex(h => {
        const hl = h.toLowerCase();
        return names.some(n => typeof n === 'function' ? n(hl) : hl === n);
    });

    // Support Czech localized export AND standard English export
    const iDate   = findCol('datum', 'time');
    const iSide   = findCol('strana', 'type');
    const iMarket = findCol('trh', 'pair');
    const iPrice  = findCol('cena', 'price');
    const iVol    = findCol('objem', 'vol');
    const iCost   = findCol(h => h.startsWith('n') && h.endsWith('klady'), 'cost', 'n\u00e1klady');
    const iId     = findCol('id', 'txid');
    const iFee    = findCol('poplatek', 'fee');   // Czech: poplatek, English: fee

    if ([iDate, iSide, iMarket, iCost].some(i => i < 0)) {
        throw new Error(
            'Unrecognised CSV format.\n\nExpected Czech columns: Datum, Strana, Trh, Náklady\n' +
            'or English columns: time, type, pair, cost\n\n' +
            `Found: ${rawHeader.join(', ')}`
        );
    }

    const trades = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = sep === '\t' ? line.split('\t') : _splitCSVLine(line);

        // Filter for BTC markets: "BTC/CHF", "BTC/USD", "XXBTZUSD", "XBTCHF", etc.
        const market = (cells[iMarket] || '').trim().toUpperCase();
        if (!market.includes('BTC') && !market.includes('XBT')) continue;

        // Normalise side: Czech "Koupit"→buy / "Prodat"→sell, English "buy"/"sell"
        const rawSide = (cells[iSide] || '').trim().toLowerCase();
        const type = rawSide === 'koupit' || rawSide === 'buy'  ? 'buy'
                   : rawSide === 'prodat' || rawSide === 'sell' ? 'sell'
                   : null;
        if (!type) continue;

        const date = (cells[iDate] || '').trim().slice(0, 10);
        if (!date || date.length < 10) continue;

        const cost = _krakenParseNum(cells[iCost]);
        if (cost <= 0) continue;

        const vol      = iVol >= 0 ? _krakenParseNum(cells[iVol]) : 0;
        const priceRaw = iPrice >= 0 ? _krakenParseNum(cells[iPrice]) : 0;

        // Fee: use CSV column if available, otherwise estimate 0.26% (standard Kraken taker fee)
        const fee        = iFee >= 0 ? _krakenParseNum(cells[iFee]) : cost * 0.0026;
        const feeEstimated = iFee < 0;

        // Effective cost including fees:
        // buys:  cost basis increases (you paid cost + fee)
        // sells: proceeds decrease   (you received cost - fee)
        const effectiveCost = type === 'buy' ? cost + fee : Math.max(0, cost - fee);

        // Detect the quote currency from the cost cell (e.g. "CHF", "USD", "EUR")
        const quoteCurrency = _krakenExtractCurrency(cells[iCost]) || _krakenExtractCurrency(cells[iPrice]) || '';

        // Derive price_usd from effective cost + vol so BTC calculation stays exact
        let priceUSD = priceRaw;
        if (vol > 0) {
            priceUSD = effectiveCost / vol;   // effective fiat per BTC (no rate — stored as-is)
        } else if (quoteCurrency && quoteCurrency !== 'USD') {
            const rate = _currRate();
            priceUSD = rate > 0 ? priceRaw / rate : priceRaw;
        }

        const krakenId = iId >= 0 ? (cells[iId] || '').trim() : '';
        trades.push({ date, type, priceUSD: Math.round(priceUSD), cost: effectiveCost, fee, feeEstimated, vol, market, krakenId });
    }

    return trades.sort((a, b) => a.date.localeCompare(b.date));
}

function _splitCSVLine(line) {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
        else { cur += ch; }
    }
    cells.push(cur);
    return cells;
}

async function _pasteKrakenImport() {
    if (!navigator.clipboard?.readText) {
        alert('Clipboard access not supported in this browser.\nUse the CSV import instead.');
        return;
    }
    let text;
    try {
        text = await navigator.clipboard.readText();
    } catch {
        alert('Could not read clipboard.\nMake sure the page has clipboard permission, then try again.');
        return;
    }
    if (!text?.trim()) {
        alert('Clipboard is empty.\nIn Kraken, select your trades and click "Copy to clipboard" first.');
        return;
    }
    try {
        const rows = _parseKrakenCSV(text);
        if (!rows.length) {
            alert('No BTC trades found in clipboard.\n\nMake sure you copied from Kraken trade history and the trades include BTC pairs.');
            return;
        }
        dbGetEntries().then(existing => {
            const importedIds = new Set();
            existing.forEach(e => {
                const m = (e.notes || '').match(/#([A-Z0-9]+)$/);
                if (m) importedIds.add(m[1]);
            });
            const importedFingerprints = new Set();
            existing.forEach(e => {
                importedFingerprints.add(
                    `${e.date}|${e.type}|${Math.round(Number(e.amount_currency) * 100)}`
                );
            });
            rows.forEach(r => {
                const byId = r.krakenId && importedIds.has(r.krakenId);
                const byFingerprint = importedFingerprints.has(
                    `${r.date}|${r.type}|${Math.round(r.cost * 100)}`
                );
                r.isDuplicate = byId || byFingerprint;
            });
            _showKrakenPreview(rows);
        }).catch(() => _showKrakenPreview(rows));
    } catch (err) {
        alert('Failed to parse clipboard content: ' + err.message);
    }
}

function _showKrakenPreview(rows) {
    // Remove any existing modal
    document.getElementById('krakenModal')?.remove();

    const sym  = _currSym().trim() || 'USD';

    const modal = document.createElement('div');
    modal.id        = 'krakenModal';
    modal.className = 'settings-modal';
    modal.style.cssText = 'display:flex;z-index:1100';

    // Detect the quote currency from the first row's market (e.g. "BTC/CHF" → "CHF")
    const quoteSym  = rows[0]?.market?.includes('/') ? rows[0].market.split('/')[1] : sym;
    const newRows   = rows.filter(r => !r.isDuplicate);
    const dupCount  = rows.length - newRows.length;

    const anyFeeEstimated = rows.some(r => r.feeEstimated);

    const tableRows = rows.map(r => {
        const costDisp = quoteSym + Number(r.cost).toLocaleString(undefined, { maximumFractionDigits: 2 });
        const feeDisp  = quoteSym + Number(r.fee).toLocaleString(undefined, { maximumFractionDigits: 2 })
                       + (r.feeEstimated ? '*' : '');
        const dupStyle = r.isDuplicate ? 'opacity:0.4;' : '';
        const statusCell = r.isDuplicate
            ? '<td style="color:#555;font-size:0.7rem">Already imported</td>'
            : '<td></td>';
        return `<tr style="${dupStyle}">
            <td>${r.date}</td>
            <td class="${r.type === 'buy' ? 'buy-cell' : 'sell-cell'}">${r.type.toUpperCase()}</td>
            <td class="btc-cell">${r.vol > 0 ? r.vol.toFixed(6) : '—'}</td>
            <td>~${_fmtCurr(r.priceUSD)}</td>
            <td>${costDisp}</td>
            <td style="color:#888">${feeDisp}</td>
            ${statusCell}
        </tr>`;
    }).join('');

    const subTitle = dupCount > 0
        ? `${rows.length} trades found — <span style="color:#00cc66">${newRows.length} new</span>, <span style="color:#555">${dupCount} already imported</span>`
        : `${rows.length} BTC trade${rows.length !== 1 ? 's' : ''} found — review before importing`;

    const importBtnLabel = newRows.length > 0
        ? `Import ${newRows.length} new trade${newRows.length !== 1 ? 's' : ''}`
        : 'Nothing new to import';

    modal.innerHTML = `
        <div class="settings-inner" style="max-width:700px;width:95%;max-height:80vh;overflow-y:auto">
            <button id="krakenModalClose" class="settings-close">×</button>
            <div class="settings-title" style="margin-bottom:4px">Import from Kraken</div>
            <div style="font-size:0.72rem;color:#888;margin-bottom:14px">${subTitle}</div>
            <div style="overflow-x:auto">
                <table class="si-table" style="min-width:520px">
                    <thead><tr>
                        <th>Date</th><th>Type</th><th>BTC Vol</th><th>Price (~)</th><th>Cost incl. fee (${quoteSym})</th><th>Fee</th><th></th>
                    </tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            <div style="font-size:0.7rem;color:#555;margin-top:10px">
                Cost column includes fees — already adjusted in the stored amount.
                ${anyFeeEstimated ? '* Fee estimated at 0.26% (standard Kraken taker rate) — no fee column found in export.' : 'Fees read from export.'}
                ${dupCount > 0 ? ' Greyed-out rows are skipped (already imported).' : ''}
            </div>
            <div id="krakenImportError" style="color:#ff5555;font-size:0.72rem;margin-top:8px"></div>
            <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
                <button id="krakenCancelBtn" class="small-btn">Cancel</button>
                <button id="krakenConfirmBtn" class="small-btn" style="background:rgba(247,147,26,.15);border-color:#f7931a66;color:#f7931a" ${newRows.length === 0 ? 'disabled' : ''}>${importBtnLabel}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('krakenModalClose').addEventListener('click', close);
    document.getElementById('krakenCancelBtn').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('krakenConfirmBtn').addEventListener('click', async () => {
        const confirmBtn = document.getElementById('krakenConfirmBtn');
        const errEl      = document.getElementById('krakenImportError');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Importing…';
        errEl.textContent = '';

        let imported = 0, failed = 0;
        for (const r of rows) {
            if (r.isDuplicate) continue;
            try {
                const noteId = r.krakenId ? ` #${r.krakenId}` : '';
                await dbAddEntry({
                    date:            r.date,
                    asset:           'BTC',
                    type:            r.type,
                    amount_currency: r.cost,
                    price_usd:       r.priceUSD,
                    notes:           `Kraken ${r.market}${noteId}`
                });
                imported++;
            } catch (_) {
                failed++;
            }
        }

        close();
        renderPortfolioEntries();

        const msg = failed
            ? `Imported ${imported} trade${imported !== 1 ? 's' : ''}. ${failed} failed.`
            : `Successfully imported ${imported} trade${imported !== 1 ? 's' : ''}.`;
        alert(msg);
    });
}

// ── Add / Edit entry form wiring ──────────────────────────────────────────────

function _wireAddEntryForm() {
    const dateEl = document.getElementById('portDate');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

    const addBtn = document.getElementById('portAddBtn');
    if (!addBtn) return;

    // Enter submits, Escape cancels edit
    document.getElementById('portAddForm')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBtn.click(); }
        if (e.key === 'Escape') _resetEditMode();
    });

    addBtn.addEventListener('click', async () => {
        const errEl = document.getElementById('portAddError');
        if (errEl) errEl.textContent = '';

        const date      = document.getElementById('portDate')?.value;
        const asset     = document.getElementById('portAsset')?.value;
        const type      = document.getElementById('portType')?.value;
        const amountStr = document.getElementById('portAmountCurrency')?.value;
        const priceStr  = document.getElementById('portPriceUSD')?.value;
        const notes     = document.getElementById('portNotes')?.value || '';

        if (!date) { if (errEl) errEl.textContent = 'Date is required.'; return; }
        if (!amountStr || isNaN(+amountStr) || +amountStr <= 0) {
            if (errEl) errEl.textContent = 'Enter a valid amount.'; return;
        }

        const entry = {
            date,
            asset,
            type,
            amount_currency: parseFloat(amountStr),
            price_usd:       parseFloat(priceStr) || 0,
            notes
        };

        addBtn.disabled = true;
        addBtn.textContent = '…';
        try {
            if (_editingId) {
                await dbUpdateEntry(_editingId, entry);
                _resetEditMode();
            } else {
                await dbAddEntry(entry);
                document.getElementById('portAmountCurrency').value = '';
                document.getElementById('portPriceUSD').value       = '';
                document.getElementById('portNotes').value          = '';
            }
            renderPortfolioEntries();
        } catch (err) {
            if (errEl) errEl.textContent = (_editingId ? 'Update' : 'Add') + ' failed: ' + err.message;
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = _editingId ? 'Update' : 'Add';
        }
    });
}
