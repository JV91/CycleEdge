// ── Module-level state ────────────────────────────────────────────────────────

let dates, prices, pricesUSD;
let ma200wRaw = null;
let signals = [], zArr = [], zSma = [];
let priceChart, indChart, yearChart;
let chartStartIdx = 0;
let topBottomLabels = {};
let currencyRate = 1, currencySymbol = '$';
const exchangeRates = { USD: 1 };
let predLineUSD = null;
let predSignals = []; // future Z-score crossover events: [{ ts, signal }]

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchBTCHistory() {
    const BASE = 'https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000';
    const allData = [];
    let toTs = null;

    for (let i = 0; i < 3; i++) {
        const url = BASE + (toTs ? `&toTs=${toTs}` : '');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`CryptoCompare API error ${res.status}`);
        const json = await res.json();
        if (json.Response !== 'Success') throw new Error(json.Message || 'API error');
        const pts = json.Data.Data;
        if (!pts.length) break;
        allData.push(...pts);
        toTs = pts[0].time - 1;
        if (pts.length < 2000) break;
    }

    const seen = new Set();
    return allData
        .filter(d => { if (seen.has(d.time) || d.close <= 0) return false; seen.add(d.time); return true; })
        .sort((a, b) => a.time - b.time)
        .map(d => ({ ts: d.time * 1000, price: d.close }));
}

// ── Live stats ────────────────────────────────────────────────────────────────

function updateCurrentStats() {
    const last = prices.length - 1;
    const curSig = signals[last], curZ = zArr[last], curSma = zSma[last];

    let sigStart = last;
    while (sigStart > 0 && signals[sigStart - 1] === curSig) sigStart--;

    const startIdx = Math.max(1, getStartIdx());
    let buyCount = 0;
    for (let i = startIdx; i < signals.length; i++)
        if (signals[i] === 'buy' && signals[i-1] !== 'buy') buyCount++;

    document.getElementById('statPrice').textContent = fmtPrice(prices[last]);
    const sigEl = document.getElementById('statSignal');
    sigEl.textContent = curSig ? curSig.toUpperCase() : '\u2014';
    sigEl.className = 'value ' + (curSig || '');
    document.getElementById('statZ').textContent = curZ !== null ? curZ.toFixed(2) : '\u2014';
    document.getElementById('statZvsSma').textContent =
        (curZ !== null && curSma !== null) ? (curZ - curSma).toFixed(2) : '\u2014';
    document.getElementById('statSince').textContent = fmtDate(dates[sigStart]);
    document.getElementById('statBuys').textContent = buyCount;

    const badge = document.getElementById('signalBadge');
    badge.textContent = curSig ? curSig.toUpperCase() : '\u2014';
    badge.className = 'signal-badge ' + (curSig || 'init');
}

function updatePerfStats() {
    const si = getStartIdx();
    const ei = prices.length - 1;
    if (si < 0 || si >= ei) return;

    const pv = buildPortfolioValues(prices, signals);
    let pvSi = si;
    while (pvSi <= ei && pv[pvSi] === null) pvSi++;
    if (pvSi >= ei) return;

    const stratReturn = pv[ei] / pv[pvSi];
    const bhReturn    = prices[ei] / prices[pvSi];
    const outperf     = stratReturn / bhReturn;

    let trades = 0, buyDays = 0;
    for (let i = pvSi + 1; i <= ei; i++) {
        if (signals[i] === 'buy' && signals[i-1] !== 'buy') trades++;
        if (signals[i] === 'buy') buyDays++;
    }

    document.getElementById('pStatStrat').textContent = fmtMult(stratReturn);
    document.getElementById('pStatBH').textContent    = fmtMult(bhReturn);
    const outEl = document.getElementById('pStatOut');
    outEl.textContent = fmtMult(outperf);
    outEl.style.color = outperf >= 1 ? '#00ff88' : '#ff4444';
    document.getElementById('pStatTrades').textContent = trades;
    document.getElementById('pStatTime').textContent   = fmtPct(buyDays / (ei - pvSi));

    // Leveraged backtest — uses the BTC Lev multiplier from the SI allocation panel
    const levMult = parseFloat(document.getElementById('btcLevMult')?.value) || 1;
    const levEl    = document.getElementById('pStatLev');
    const levOutEl = document.getElementById('pStatLevOut');
    const levLbl   = document.getElementById('pStatLevLabel');
    if (levLbl) levLbl.textContent = levMult !== 1 ? `(${levMult}×)` : '';
    if (levMult !== 1) {
        const pvL      = buildPortfolioValues(prices, signals, levMult);
        const levReturn = pvL[ei] / pvL[pvSi];
        const levOut    = levReturn / bhReturn;
        if (levEl) { levEl.textContent = isFinite(levReturn) ? fmtMult(levReturn) : 'LIQUIDATED'; levEl.style.color = levReturn > stratReturn ? '#00ff88' : '#ff4444'; }
        if (levOutEl) { levOutEl.textContent = isFinite(levOut) ? fmtMult(levOut) : '—'; levOutEl.style.color = levOut >= 1 ? '#00ff88' : '#ff4444'; }
    } else {
        if (levEl)    { levEl.textContent = '—';    levEl.style.color = ''; }
        if (levOutEl) { levOutEl.textContent = '—'; levOutEl.style.color = ''; }
    }
}

function refreshYearChart() {
    if (!yearChart) return;
    const yr = +document.getElementById('startYear').value || 0;
    const pv = buildPortfolioValues(prices, signals);
    const all = computeYearlyReturns(dates, pv, prices);
    const data = yr ? all.filter(y => y.year >= yr) : all;

    yearChart.data.labels = data.map(y => y.year);
    yearChart.data.datasets[0].data            = data.map(y => y.strat);
    yearChart.data.datasets[0].backgroundColor = data.map(y => y.strat >= 0 ? '#00cc6677' : '#cc333377');
    yearChart.data.datasets[0].borderColor      = data.map(y => y.strat >= 0 ? '#00cc66'   : '#cc3333');
    yearChart.data.datasets[1].data            = data.map(y => y.bh);
    yearChart.data.datasets[1].backgroundColor = data.map(y => y.bh >= 0 ? '#5577ff55' : '#aa445566');
    yearChart.data.datasets[1].borderColor      = data.map(y => y.bh >= 0 ? '#5577ff'   : '#aa4455');
    yearChart.update('none');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStartIdx() {
    const yr = +document.getElementById('startYear').value;
    const firstValid = signals.findIndex(s => s !== null);
    if (!yr) return firstValid;
    const startTs = new Date(yr, 0, 1).getTime();
    const idx = dates.findIndex(d => d >= startTs);
    return Math.max(idx >= 0 ? idx : firstValid, firstValid);
}

function applyStartFilter() {
    chartStartIdx = getStartIdx();
    const buyPts = [], sellPts = [];
    for (let i = Math.max(1, chartStartIdx); i < signals.length; i++) {
        if (signals[i] === 'buy'  && signals[i-1] !== 'buy')  buyPts.push({ x: dates[i], y: prices[i] });
        if (signals[i] === 'sell' && signals[i-1] !== 'sell') sellPts.push({ x: dates[i], y: prices[i] });
    }
    priceChart.data.datasets[1].data = buyPts;
    priceChart.data.datasets[2].data = sellPts;
    priceChart.update('none');
}

function rebuildTopBottomLabels() {
    CYCLE_TOPS.forEach((t, i) => {
        if (!topBottomLabels[`topLbl${i}`]) return;
        topBottomLabels[`topLbl${i}`].content = t.predicted
            ? [`Top ${new Date(t.x).getFullYear()} (predicted)`, `~${fmtPrice(t.y)}`, `~+${t.daysFromHalving}d from halving`, t.pct]
            : [`Top ${new Date(t.x).getFullYear()}`, fmtPrice(t.y), `+${t.daysFromHalving}d from halving`, t.pct];
        topBottomLabels[`topLbl${i}`].yValue = t.y;
    });
    CYCLE_BOTTOMS.forEach((b, i) => {
        if (!topBottomLabels[`botLbl${i}`]) return;
        topBottomLabels[`botLbl${i}`].content = b.predicted
            ? [`Bottom ${new Date(b.x).getFullYear()} (predicted)`, `~${fmtPrice(b.y)}`,
               `~+${b.daysFromHalving}d from halving`, `~${b.daysFromTop}d from top`, b.pct]
            : [`Bottom ${new Date(b.x).getFullYear()}`, fmtPrice(b.y),
               `+${b.daysFromHalving}d from halving`, `${b.daysFromTop}d from top`, b.pct];
        topBottomLabels[`botLbl${i}`].yValue = b.y;
    });
}

async function switchCurrency(currency) {
    if (!exchangeRates[currency]) {
        try {
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            const data = await res.json();
            exchangeRates.CZK = data.rates.CZK;
            exchangeRates.CHF = data.rates.CHF;
        } catch (e) {
            console.error('Exchange rate fetch failed', e);
            return;
        }
    }
    currencyRate   = exchangeRates[currency];
    currencySymbol = { USD: '$', CZK: 'Kč\u00a0', CHF: 'CHF\u00a0' }[currency];

    // Convert price data
    for (let i = 0; i < prices.length; i++) prices[i] = pricesUSD[i] * currencyRate;

    // Convert cycle markers
    [...CYCLE_TOPS, ...CYCLE_BOTTOMS].forEach(m => { m.y = m._yUSD * currencyRate; });

    // Update chart datasets
    priceChart.data.datasets[0].data = dates.map((d, i) => ({ x: d, y: prices[i] }));
    priceChart.data.datasets[3].data = CYCLE_TOPS.map(t => ({ x: t.x, y: t.y }));
    priceChart.data.datasets[4].data = CYCLE_BOTTOMS.map(b => ({ x: b.x, y: b.y }));
    if (ma200wRaw) {
        priceChart.data.datasets[5].data = dates.map((d, i) => ({
            x: d, y: ma200wRaw[i] !== null ? ma200wRaw[i] * currencyRate : null
        }));
    }
    if (predLineUSD) {
        priceChart.data.datasets[6].data = predLineUSD.map(p => ({ x: p.x, y: p.y * currencyRate }));
    }
    // Reset y-axis range
    priceChart.options.scales.y.max = 2000000 * currencyRate;
    priceChart.options.scales.y.min = undefined;

    document.getElementById('priceChartTitle').textContent =
        `Bitcoin Price (${currency}) — Log Scale · Green = in market · Red = cash`;

    rebuildTopBottomLabels();
    applyStartFilter();
    priceChart.update('none');
    updateCurrentStats();
    updatePerfStats();
    renderStrategyDashboard();
    if (typeof updateTradesOverlay === 'function') updateTradesOverlay();
    if (typeof renderPortfolioEntries === 'function') renderPortfolioEntries();
    if (typeof renderAlerts === 'function') renderAlerts();
}

// ── Slider -> recompute ───────────────────────────────────────────────────────

function rebuildPredSignals() {
    const zWin     = +document.getElementById('zWin').value;
    const smaWin   = +document.getElementById('smaWin').value;
    const entryBuf = +document.getElementById('entryBuf').value;
    const exitBuf  = +document.getElementById('exitBuf').value;
    predSignals = generatePredictedSignals(zWin, smaWin, entryBuf, exitBuf);
    renderStrategyDashboard();
}

function updateFromParams() {
    const zWin     = +document.getElementById('zWin').value;
    const smaWin   = +document.getElementById('smaWin').value;
    const entryBuf = +document.getElementById('entryBuf').value;
    const exitBuf  = +document.getElementById('exitBuf').value;

    document.getElementById('zWinVal').textContent    = zWin + 'd';
    document.getElementById('smaWinVal').textContent  = smaWin + 'd';
    document.getElementById('entryBufVal').textContent = (entryBuf >= 0 ? '+' : '') + entryBuf.toFixed(2);
    document.getElementById('exitBufVal').textContent  = (exitBuf  >= 0 ? '+' : '') + exitBuf.toFixed(2);

    const result = computeSignals(prices, zWin, smaWin, entryBuf, exitBuf);
    signals.splice(0, signals.length, ...result.signals);
    zArr.splice(0, zArr.length, ...result.zArr);
    zSma.splice(0, zSma.length, ...result.zSma);

    applyStartFilter();
    priceChart.update('none');

    indChart.data.datasets[0].data = dates.map((d, i) => ({ x: d, y: zArr[i] }));
    indChart.data.datasets[1].data = dates.map((d, i) => ({ x: d, y: zSma[i] }));
    indChart.data.datasets[2].data = dates.map((d, i) => ({ x: d, y: zSma[i] !== null ? zSma[i] + 1.5 : null }));
    indChart.data.datasets[3].data = dates.map((d, i) => ({ x: d, y: zSma[i] !== null ? zSma[i] + 2.5 : null }));
    indChart.data.datasets[4].data = dates.map((d, i) => ({ x: d, y: zSma[i] !== null ? zSma[i] + 4.0 : null }));
    indChart.update('none');

    updateCurrentStats();
    updatePerfStats();
    refreshYearChart();
    rebuildPredSignals();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function init() {
    let history;
    try {
        history = await fetchBTCHistory();
    } catch (err) {
        document.getElementById('priceLoader').innerHTML =
            `<div style="color:#ff4444;text-align:center">
               Failed to load data: ${err.message}<br>
               <small style="color:#555">Check your connection and try refreshing.</small>
             </div>`;
        return;
    }

    dates  = history.map(h => h.ts);
    prices = history.map(h => h.price);

    const init0 = computeSignals(prices, 365, 200, 0, 0);
    signals.push(...init0.signals);
    zArr.push(...init0.zArr);
    zSma.push(...init0.zSma);

    // Populate year select
    const startYearEl = document.getElementById('startYear');
    const firstValidIdx = signals.findIndex(s => s !== null);
    const firstYr = new Date(dates[firstValidIdx]).getFullYear();
    const curYr   = new Date().getFullYear();
    for (let y = firstYr; y <= curYr; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        startYearEl.appendChild(opt);
    }

    // Build initial datasets
    pricesUSD = [...prices];
    const priceDs = dates.map((d, i) => ({ x: d, y: prices[i] }));
    ma200wRaw = rollingMean(prices, 1400);
    const ma200wDs  = dates.map((d, i) => ({ x: d, y: ma200wRaw[i] }));
    const mkTierDs = offset => dates.map((d, i) => ({ x: d, y: zSma[i] !== null ? zSma[i] + offset : null }));
    predLineUSD = generatePredictionLine(
        parseFloat(document.getElementById('siProjTopPrice')?.value) || 201521,
        parseFloat(document.getElementById('siProjBottomPrice')?.value) || 27800
    );
    // predSignals built later in updateFromParams → rebuildPredSignals
    const predDs = predLineUSD.map(p => ({ x: p.x, y: p.y }));

    // Leverage entry zone annotations (halving+30d → halving+450d per cycle)
    const levZoneAnnots = {};
    HALVINGS.slice(1).forEach((h, i) => {
        levZoneAnnots[`levZone${i}`] = {
            type: 'box',
            xMin: h.ts + 30  * 86400000,
            xMax: h.ts + 450 * 86400000,
            backgroundColor: '#00ff8808',
            borderColor: '#00ff8833',
            borderWidth: 1,
            display: false,
            label: { display: false }
        };
    });
    const buyPts = [], sellPts = [];
    for (let i = 1; i < signals.length; i++) {
        if (signals[i] === 'buy'  && signals[i-1] !== 'buy')  buyPts.push({ x: dates[i], y: prices[i] });
        if (signals[i] === 'sell' && signals[i-1] !== 'sell') sellPts.push({ x: dates[i], y: prices[i] });
    }
    const zDs    = dates.map((d, i) => ({ x: d, y: zArr[i] }));
    const zSmaDs = dates.map((d, i) => ({ x: d, y: zSma[i] }));

    document.getElementById('priceLoader').style.display = 'none';
    const priceCanvas = document.getElementById('priceChart');
    priceCanvas.style.display = 'block';

    // Track raw cursor x-pixel so tooltip filter can do real distance checks
    let _priceHoverPx = null;
    priceCanvas.addEventListener('mousemove', e => { _priceHoverPx = e.offsetX; });
    priceCanvas.addEventListener('mouseleave', () => { _priceHoverPx = null; });

    // Synced zoom/pan
    let syncing = false;
    function syncX(source, target) {
        if (syncing) return;
        syncing = true;
        const { min, max } = source.scales.x;
        target.zoomScale('x', { min, max }, 'none');
        syncing = false;
    }

    // Auto-scale Y axis to visible price data so zoomed views don't look flat
    function autoScaleY(chart) {
        const { min: xMin, max: xMax } = chart.scales.x;
        const data = chart.data.datasets[0].data;
        let lo = Infinity, hi = -Infinity;
        for (const p of data) {
            if (p.x >= xMin && p.x <= xMax && p.y > 0) {
                if (p.y < lo) lo = p.y;
                if (p.y > hi) hi = p.y;
            }
        }
        if (!isFinite(lo)) return;
        // Add 25% log-space padding so labels/signals have room
        const pad = Math.pow(hi / lo, 0.35);
        chart.options.scales.y.min = lo / pad;
        chart.options.scales.y.max = Math.max(hi * pad, hi * 2);
        chart.update('none');
    }

    function resetScaleY(chart) {
        chart.options.scales.y.min = undefined;
        chart.options.scales.y.max = 2000000;
        chart.update('none');
    }

    const isMobile = window.innerWidth <= 768;
    const ptBuy  = isMobile ? 5 : 9;
    const ptSell = isMobile ? 5 : 9;
    const ptHover = isMobile ? 7 : 12;
    const ptStar = isMobile ? 6 : 11;
    const ptStarHover = isMobile ? 8 : 14;
    const ptTrade = isMobile ? 6 : 10;
    const ptTradeHover = isMobile ? 8 : 13;
    const tickFont = isMobile ? 9 : 11;
    const annotFont = isMobile ? 8 : 11;
    const annotSmFont = isMobile ? 7 : 10;
    const annotYAdjTop = isMobile ? -42 : -62;
    const annotYAdjBot = isMobile ? 46 : 68;
    const annotPad = isMobile ? { x: 4, y: 3 } : { x: 6, y: 4 };

    const zoomPlug = (getOther, afterSync) => ({
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x',
                onZoom: ({ chart }) => { syncX(chart, getOther()); if (afterSync) afterSync(chart); } },
        pan:  { enabled: true, mode: 'x',
                onPan:  ({ chart }) => { syncX(chart, getOther()); if (afterSync) afterSync(chart); } }
    });

    const sharedX = {
        type: 'time', time: { unit: 'year' },
        grid: { color: '#111120' },
        ticks: { color: '#3a3a5a', font: { size: tickFont }, maxRotation: 0, maxTicksLimit: isMobile ? 6 : undefined }
    };

    // Build annotation objects (stored so we can toggle display)
    const halvAnnots = {};
    HALVINGS.forEach((h, i) => {
        halvAnnots[`halv${i}`] = {
            type: 'line',
            xMin: h.ts, xMax: h.ts,
            borderColor: '#f7931a55',
            borderWidth: 1.5,
            borderDash: [6, 4],
            display: false,
            label: {
                display: false,
                content: h.label,
                position: 'start',
                yAdjust: 6,
                color: '#f7931a99',
                font: { size: 9 },
                backgroundColor: 'transparent',
                padding: 2
            }
        };
    });
    const zoneAnnots = {};
    CYCLE_ZONES.forEach((z, i) => {
        zoneAnnots[`zone${i}`] = {
            type: 'box',
            xMin: z.from, xMax: z.to,
            backgroundColor: i % 2 === 0 ? '#f7931a0a' : '#ffffff05',
            borderWidth: 0,
            display: false
        };
    });
    topBottomLabels = {};
    CYCLE_TOPS.forEach((t, i) => {
        topBottomLabels[`topLbl${i}`] = {
            type: 'label',
            xValue: t.x, yValue: t.y,
            yScaleID: 'y',
            xScaleID: 'x',
            content: t.predicted
                ? [`Top ${new Date(t.x).getFullYear()} (predicted)`, `~${fmtPrice(t.y)}`, `~+${t.daysFromHalving}d from halving`, t.pct]
                : [`Top ${new Date(t.x).getFullYear()}`, fmtPrice(t.y), `+${t.daysFromHalving}d from halving`, t.pct],
            color: '#ffffff',
            font: [{ size: annotFont, weight: 'bold' }, { size: annotFont, weight: 'bold' }, { size: annotSmFont }, { size: annotSmFont }],
            textAlign: 'center',
            backgroundColor: t.predicted ? '#1a1200cc' : '#1a1200ee',
            borderColor: t.predicted ? '#ffd70066' : '#ffd700aa',
            borderWidth: 1,
            borderDash: t.predicted ? [4, 3] : [],
            borderRadius: 4,
            padding: annotPad,
            xAdjust: t.xAdjust || 0,
            yAdjust: annotYAdjTop,
            display: false
        };
    });
    CYCLE_BOTTOMS.forEach((b, i) => {
        topBottomLabels[`botLbl${i}`] = {
            type: 'label',
            xValue: b.x, yValue: b.y,
            yScaleID: 'y',
            xScaleID: 'x',
            content: b.predicted
                ? [`Bottom ${new Date(b.x).getFullYear()} (predicted)`, `~${fmtPrice(b.y)}`, `~+${b.daysFromHalving}d from halving`, `~${b.daysFromTop}d from top`, b.pct]
                : [`Bottom ${new Date(b.x).getFullYear()}`, fmtPrice(b.y), `+${b.daysFromHalving}d from halving`, `${b.daysFromTop}d from top`, b.pct],
            color: '#ffffff',
            font: [{ size: annotFont, weight: 'bold' }, { size: annotFont, weight: 'bold' }, { size: annotSmFont }, { size: annotSmFont }, { size: annotSmFont }],
            textAlign: 'center',
            backgroundColor: b.predicted ? '#101800ee' : '#001018ee',
            borderColor: b.predicted ? '#aaff0099' : '#00ccffaa',
            borderWidth: 1,
            borderDash: b.predicted ? [4, 3] : [],
            borderRadius: 4,
            padding: annotPad,
            yAdjust: annotYAdjBot,
            display: false
        };
    });

    priceChart = new Chart(priceCanvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'BTC/USD', data: priceDs,
                    borderWidth: 1.5, pointRadius: 0, tension: 0, spanGaps: false, fill: false,
                    segment: {
                        borderColor: ctx => {
                            if (ctx.p0DataIndex < chartStartIdx) return '#3a3a4a';
                            const s = signals[ctx.p0DataIndex];
                            return s === 'buy' ? '#00bb55' : s === 'sell' ? '#bb2222' : '#333';
                        }
                    }
                },
                { label: 'Buy signal', data: buyPts, type: 'scatter', pointStyle: 'triangle',
                  rotation: 0,   pointRadius: ptBuy, pointHoverRadius: ptHover,
                  backgroundColor: '#00ff88', borderColor: '#005533', borderWidth: 1, showLine: false },
                { label: 'Sell signal', data: sellPts, type: 'scatter', pointStyle: 'triangle',
                  rotation: 180, pointRadius: ptSell, pointHoverRadius: ptHover,
                  backgroundColor: '#ff4444', borderColor: '#550000', borderWidth: 1, showLine: false },
                // Cycle tops (index 3) — initially hidden
                { label: 'Cycle Top', data: CYCLE_TOPS, type: 'scatter', pointStyle: 'star',
                  pointRadius: ptStar, pointHoverRadius: ptStarHover,
                  backgroundColor: '#ffd700cc', borderColor: '#ffd700', borderWidth: 1,
                  showLine: false, hidden: true },
                // Cycle bottoms (index 4) — initially hidden
                { label: 'Cycle Bottom', data: CYCLE_BOTTOMS, type: 'scatter', pointStyle: 'star',
                  pointRadius: ptStar, pointHoverRadius: ptStarHover,
                  backgroundColor: '#00ccffcc', borderColor: '#00ccff', borderWidth: 1,
                  showLine: false, hidden: true },
                // 200-week MA (index 5) — initially hidden
                { label: '200W MA', data: ma200wDs,
                  borderColor: '#ff6600cc', borderWidth: 2, pointRadius: 0,
                  tension: 0.3, spanGaps: false, fill: false, hidden: true },
                // Cycle prediction line (index 6) — visible by default
                { label: 'Cycle Prediction', data: predDs,
                  borderColor: '#888899cc', borderWidth: 2, borderDash: [6, 4], pointRadius: 0,
                  tension: 0.3, spanGaps: false, fill: false, hidden: false },
                // Dataset 7: Real buy trades (diamond)
                { label: 'My Buys', data: [], type: 'scatter',
                  pointStyle: 'rectRot', pointRadius: ptTrade, pointHoverRadius: ptTradeHover,
                  borderColor: '#00ff99', borderWidth: 2,
                  backgroundColor: '#00cc66cc',
                  showLine: false, hidden: false },
                // Dataset 8: Real sell trades (diamond)
                { label: 'My Sells', data: [], type: 'scatter',
                  pointStyle: 'rectRot', pointRadius: ptTrade, pointHoverRadius: ptTradeHover,
                  borderColor: '#ff8855', borderWidth: 2,
                  backgroundColor: '#ff5533cc',
                  showLine: false, hidden: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'x', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#131320', borderColor: '#2a2a42', borderWidth: 1,
                    titleColor: '#666', bodyColor: '#ccc', padding: 10,
                    filter: (() => {
                        // Deduplicate by label — mode:'x' can return multiple points per dataset
                        const seen = new Set();
                        let lastCallTs = 0;
                        return item => {
                            // Reset seen set each new tooltip render (new hover position)
                            const now = Date.now();
                            if (now !== lastCallTs) { seen.clear(); lastCallTs = now; }

                            const label = item.dataset.label;
                            if (seen.has(label)) return false;
                            seen.add(label);

                            if (_priceHoverPx === null) return true;
                            const hoveredDataX = item.chart.scales.x.getValueForPixel(_priceHoverPx);
                            if (hoveredDataX == null) return true;

                            if (['Cycle Top', 'Cycle Bottom'].includes(label)) {
                                return Math.abs(item.parsed.x - hoveredDataX) < 90 * 86400000;
                            }
                            const btcData = item.chart.data.datasets[0].data;
                            const lastBtcX = btcData[btcData.length - 1]?.x;
                            if (lastBtcX && hoveredDataX > lastBtcX + 30 * 86400000) {
                                return label === 'Cycle Prediction';
                            }
                            if (label === 'Cycle Prediction') return false;
                            return true;
                        };
                    })(),
                    callbacks: {
                        title: items => {
                            if (!items.length) return '';
                            const markerOnly = items.every(it => ['Cycle Top','Cycle Bottom'].includes(it.dataset.label));
                            const src = markerOnly
                                ? items[0]
                                : (items.find(it => it.dataset.label === 'BTC/USD') ?? items[0]);
                            return fmtDate(src.parsed.x);
                        },
                        label: ctx => {
                            if (ctx.dataset.label === 'BTC/USD')
                                return ` Price: ${fmtPrice(ctx.parsed.y)}  [${signals[ctx.dataIndex]?.toUpperCase() ?? '--'}]`;
                            if (ctx.dataset.label === 'Cycle Top') {
                                const t = CYCLE_TOPS[ctx.dataIndex];
                                const yr = new Date(t.x).getFullYear();
                                const tag = t.predicted ? ' (predicted)' : '';
                                const price = t.predicted ? `~${fmtPrice(ctx.parsed.y)}` : fmtPrice(ctx.parsed.y);
                                return [` Cycle Top ${yr}${tag}: ${price}`, ` +${t.daysFromHalving}d from ${t.halvingYear} halving · ${t.pct} gain`];
                            }
                            if (ctx.dataset.label === 'Cycle Bottom') {
                                const b = CYCLE_BOTTOMS[ctx.dataIndex];
                                const yr  = new Date(b.x).getFullYear();
                                const tag = b.predicted ? ' (predicted)' : '';
                                return [` Cycle Bottom ${yr}${tag}: ${fmtPrice(ctx.parsed.y)}`, ` +${b.daysFromHalving}d from ${b.halvingYear} halving · ${b.daysFromTop}d from top · ${b.pct}`];
                            }
                            if (ctx.dataset.label === 'Cycle Prediction')
                                return ` Predicted price: ~${fmtPrice(ctx.parsed.y)}`;
                            if (ctx.dataset.label === 'My Buys') {
                                const amt = ctx.raw.amount ? `  (${ctx.raw.amountFmt})` : '';
                                return ` My Buy: ${fmtPrice(ctx.parsed.y)}${amt}`;
                            }
                            if (ctx.dataset.label === 'My Sells') {
                                const amt = ctx.raw.amount ? `  (${ctx.raw.amountFmt})` : '';
                                return ` My Sell: ${fmtPrice(ctx.parsed.y)}${amt}`;
                            }
                            return ` ${ctx.dataset.label}: ${fmtPrice(ctx.parsed.y)}`;
                        }
                    }
                },
                zoom: zoomPlug(() => indChart, autoScaleY),
                annotation: { annotations: { ...halvAnnots, ...zoneAnnots, ...topBottomLabels, ...levZoneAnnots } }
            },
            scales: {
                x: sharedX,
                y: {
                    type: 'logarithmic', grid: { color: '#111120' },
                    max: 2000000,
                    ticks: { color: '#3a3a5a', font: { size: tickFont }, maxTicksLimit: isMobile ? 6 : undefined,
                             callback: v => { const l = Math.log10(v); return Math.abs(l - Math.round(l)) < 0.01 ? fmtPrice(v) : null; } }
                }
            }
        }
    });

    indChart = new Chart(document.getElementById('indChart').getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Z-Score', data: zDs,
                    borderColor: '#f7931a', borderWidth: 1.5, pointRadius: 0,
                    tension: 0.15, spanGaps: false, fill: false,
                    segment: {
                        borderColor: ctx => {
                            const s = signals[ctx.p0DataIndex];
                            return s === 'buy' ? '#00cc66' : s === 'sell' ? '#cc3333' : '#f7931a';
                        }
                    }
                },
                { label: 'SMA of Z-Score', data: zSmaDs,
                  borderColor: '#5577ff', borderWidth: 1.5, pointRadius: 0,
                  tension: 0.15, spanGaps: false, fill: false },
                // Tier sell levels (indices 2,3,4) — hidden by default
                { label: 'Sell 25% (SMA+1.5)', data: mkTierDs(1.5),
                  borderColor: '#ffaa00bb', borderWidth: 1, borderDash: [6,3], pointRadius: 0,
                  tension: 0.15, spanGaps: false, fill: false, hidden: true },
                { label: 'Sell 50% (SMA+2.5)', data: mkTierDs(2.5),
                  borderColor: '#ff6600bb', borderWidth: 1, borderDash: [6,3], pointRadius: 0,
                  tension: 0.15, spanGaps: false, fill: false, hidden: true },
                { label: 'Sell All (SMA+4.0)',  data: mkTierDs(4.0),
                  borderColor: '#ff2222bb', borderWidth: 1, borderDash: [6,3], pointRadius: 0,
                  tension: 0.15, spanGaps: false, fill: false, hidden: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#131320', borderColor: '#2a2a42', borderWidth: 1,
                    titleColor: '#666', bodyColor: '#ccc', padding: 10,
                    callbacks: {
                        title: items => fmtDate(items[0].parsed.x),
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(3) ?? '--'}`
                    }
                },
                zoom: zoomPlug(() => priceChart),
                annotation: {
                    annotations: {
                        zero: { type: 'line', yMin: 0, yMax: 0,
                                borderColor: '#2a2a42', borderWidth: 1, borderDash: [4, 4] }
                    }
                }
            },
            scales: {
                x: sharedX,
                y: { grid: { color: '#111120' }, ticks: { color: '#3a3a5a', font: { size: tickFont } } }
            }
        }
    });

    // ── Yearly returns chart ──────────────────────────────────────────────────

    const pv0  = buildPortfolioValues(prices, signals);
    const yr0  = computeYearlyReturns(dates, pv0, prices);

    yearChart = new Chart(document.getElementById('yearChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: yr0.map(y => y.year),
            datasets: [
                { label: 'Strategy',
                  data: yr0.map(y => y.strat),
                  backgroundColor: yr0.map(y => y.strat >= 0 ? '#00cc6677' : '#cc333377'),
                  borderColor:     yr0.map(y => y.strat >= 0 ? '#00cc66'   : '#cc3333'),
                  borderWidth: 1, borderRadius: 3 },
                { label: 'Buy & Hold',
                  data: yr0.map(y => y.bh),
                  backgroundColor: yr0.map(y => y.bh >= 0 ? '#5577ff55' : '#aa445566'),
                  borderColor:     yr0.map(y => y.bh >= 0 ? '#5577ff'   : '#aa4455'),
                  borderWidth: 1, borderRadius: 3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#666', font: { size: 11 }, usePointStyle: true, pointStyleWidth: 10 } },
                tooltip: {
                    backgroundColor: '#131320', borderColor: '#2a2a42', borderWidth: 1,
                    titleColor: '#888', bodyColor: '#ccc', padding: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y}%`
                    }
                }
            },
            scales: {
                x: { grid: { color: '#111120' }, ticks: { color: '#3a3a5a', font: { size: 11 } } },
                y: { grid: { color: '#111120' }, ticks: { color: '#3a3a5a', font: { size: 11 },
                             callback: v => (v > 0 ? '+' : '') + v + '%' } }
            }
        }
    });

    // ── Event wiring ──────────────────────────────────────────────────────────

    const resetZoom = () => { priceChart.resetZoom(); indChart.resetZoom(); resetScaleY(priceChart); };
    document.getElementById('resetPrice').addEventListener('click', resetZoom);
    document.getElementById('resetInd').addEventListener('click', resetZoom);

    // Start-year filter
    startYearEl.addEventListener('change', () => {
        const yr = +startYearEl.value;
        if (yr) {
            const ts = new Date(yr, 0, 1).getTime();
            priceChart.zoomScale('x', { min: ts, max: Date.now() }, 'none');
            indChart.zoomScale('x', { min: ts, max: Date.now() }, 'none');
        } else {
            priceChart.resetZoom(); indChart.resetZoom();
        }
        applyStartFilter();
        updateCurrentStats();
        updatePerfStats();
        refreshYearChart();
    });

    // Tops/Bottoms toggle
    document.getElementById('toggleTops').addEventListener('click', function () {
        const show = !this.classList.contains('active');
        this.classList.toggle('active');
        priceChart.data.datasets[3].hidden = !show;
        priceChart.data.datasets[4].hidden = !show;
        Object.values(topBottomLabels).forEach(a => { a.display = show; });
        priceChart.update('none');
    });

    // 4-Year Cycle toggle
    document.getElementById('toggle4Y').addEventListener('click', function () {
        const show = !this.classList.contains('active');
        this.classList.toggle('active');
        Object.values(halvAnnots).forEach(a => { a.display = show; if (a.label) a.label.display = show; });
        Object.values(zoneAnnots).forEach(a => a.display = show);
        priceChart.update('none');
    });

    // 200-Week MA toggle
    document.getElementById('toggle200W').addEventListener('click', function () {
        const show = !this.classList.contains('active');
        this.classList.toggle('active');
        priceChart.data.datasets[5].hidden = !show;
        priceChart.update('none');
    });

    // Tier level lines toggle
    document.getElementById('toggleTierLines').addEventListener('click', function () {
        const show = !this.classList.contains('active');
        this.classList.toggle('active');
        [2, 3, 4].forEach(i => { indChart.data.datasets[i].hidden = !show; });
        indChart.update('none');
    });

    // Leverage zone toggle
    document.getElementById('toggleLevZone').addEventListener('click', function () {
        const show = !this.classList.contains('active');
        this.classList.toggle('active');
        Object.values(levZoneAnnots).forEach(a => { a.display = show; });
        priceChart.update('none');
    });

    // Projected bottom/top price — regenerate prediction line and re-render strategy
    const rebuildPredLine = () => {
        const projTop    = Math.max(50000, parseFloat(document.getElementById('siProjTopPrice').value)    || 201521);
        const projBottom = Math.max(5000,  parseFloat(document.getElementById('siProjBottomPrice').value) || 27800);
        predLineUSD = generatePredictionLine(projTop, projBottom);
        priceChart.data.datasets[6].data = predLineUSD.map(p => ({ x: p.x, y: p.y * currencyRate }));
        priceChart.update('none');
        rebuildPredSignals(); // also calls renderStrategyDashboard
    };
    document.getElementById('siProjTopPrice').addEventListener('change', rebuildPredLine);
    document.getElementById('siProjBottomPrice').addEventListener('change', rebuildPredLine);

    // Cycle prediction line toggle
    document.getElementById('togglePredLine').addEventListener('click', function () {
        const show = !this.classList.contains('active');
        this.classList.toggle('active');
        priceChart.data.datasets[6].hidden = !show;
        priceChart.update('none');
    });


    // Individual parameter sliders
    ['zWin', 'smaWin', 'entryBuf', 'exitBuf'].forEach(id =>
        document.getElementById(id).addEventListener('input', () => {
            document.getElementById('presetSlider').value = '';
            updatePresetTrack(NaN);
            updateFromParams();
        }));

    // Preset slider
    const ORIG = { zWin: 365, smaWin: 200, entryBuf: 0.00, exitBuf: 0.00 };
    const REC  = { zWin: 365, smaWin: 130, entryBuf: 0.25, exitBuf: 0.15 };
    const lerp = (a, b, t) => a + (b - a) * t;

    function updatePresetTrack(val) {
        const el = document.getElementById('presetSlider');
        if (isNaN(val)) { el.style.background = '#1c1c2e'; return; }
        el.style.background = `linear-gradient(to right, #f7931a ${val}%, #1c1c2e ${val}%)`;
    }

    document.getElementById('presetSlider').addEventListener('input', function () {
        const t = this.value / 100;
        const snap5  = v => Math.round(v / 5) * 5;
        const snap05 = v => Math.round(v / 0.05) * 0.05;
        document.getElementById('zWin').value     = snap5(lerp(ORIG.zWin,     REC.zWin,     t));
        document.getElementById('smaWin').value   = snap5(lerp(ORIG.smaWin,   REC.smaWin,   t));
        document.getElementById('entryBuf').value = snap05(lerp(ORIG.entryBuf, REC.entryBuf, t)).toFixed(2);
        document.getElementById('exitBuf').value  = snap05(lerp(ORIG.exitBuf,  REC.exitBuf,  t)).toFixed(2);
        updatePresetTrack(+this.value);
        updateFromParams();
    });

    document.getElementById('resetParams').addEventListener('click', () => {
        document.getElementById('zWin').value     = 365;
        document.getElementById('smaWin').value   = 200;
        document.getElementById('entryBuf').value = 0;
        document.getElementById('exitBuf').value  = 0;
        document.getElementById('presetSlider').value = 0;
        updatePresetTrack(0);
        updateFromParams();
    });

    // Enable all chart overlays by default
    ['toggleTops','toggle4Y','toggle200W','toggleLevZone','togglePredLine'].forEach(id => {
        document.getElementById(id)?.classList.add('active');
    });
    priceChart.data.datasets[3].hidden = false; // cycle tops
    priceChart.data.datasets[4].hidden = false; // cycle bottoms
    priceChart.data.datasets[5].hidden = false; // 200W MA
    priceChart.data.datasets[6].hidden = false; // prediction
    Object.values(topBottomLabels).forEach(a => { a.display = true; });
    Object.values(halvAnnots).forEach(a => { a.display = true; if (a.label) a.label.display = true; });
    Object.values(zoneAnnots).forEach(a => { a.display = true; });
    Object.values(levZoneAnnots).forEach(a => { a.display = true; });

    // Default stats start year to 2022
    document.getElementById('startYear').value = '2022';

    updateFromParams();
    // Default to CHF on load
    await switchCurrency('CHF');

    if (typeof initAuth === 'function') initAuth();
    if (typeof initPortfolioTracker === 'function') initPortfolioTracker();
    if (typeof initAlerts === 'function') initAlerts();
    // initSettings() and startPricePolling() called later after poll fn is defined

    // ── Collapsible panels ────────────────────────────────────────────────────
    document.querySelectorAll('.panel > .panel-header').forEach(header => {
        header.addEventListener('click', e => {
            if (e.target.closest('button, select, input, a')) return;
            const panel = header.closest('.panel');
            panel.classList.toggle('panel-collapsed');
            // Resize charts inside after expanding so they fill correctly
            if (!panel.classList.contains('panel-collapsed')) {
                panel.querySelectorAll('canvas').forEach(c => {
                    const ch = Chart.getChart(c);
                    if (ch) ch.resize();
                });
            }
        });
    });

    // ── Scroll to top button ──────────────────────────────────────────────────
    const scrollBtn = document.createElement('button');
    scrollBtn.id = 'scrollTopBtn';
    scrollBtn.textContent = '↑';
    scrollBtn.title = 'Back to top';
    document.body.appendChild(scrollBtn);
    window.addEventListener('scroll', () => {
        const show = window.scrollY > 400;
        scrollBtn.style.opacity       = show ? '1' : '0';
        scrollBtn.style.pointerEvents = show ? '' : 'none';
    }, { passive: true });
    scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Track last known signal to detect changes
    let _lastKnownSignal = null;

    // Extract poll function so settings.js can reschedule it
    async function _pollPrice() {
        try {
            const resp = await fetch('https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD');
            const json = await resp.json();
            const latestUSD = json.USD;
            if (!latestUSD) return;

            const todayTs = new Date().setHours(0,0,0,0);
            const lastIdx = dates.length - 1;
            if (dates[lastIdx] === todayTs) {
                pricesUSD[lastIdx] = latestUSD;
                prices[lastIdx]    = latestUSD * currencyRate;
            } else {
                dates.push(todayTs);
                pricesUSD.push(latestUSD);
                prices.push(latestUSD * currencyRate);
            }

            predLineUSD = generatePredictionLine(
                parseFloat(document.getElementById('siProjTopPrice')?.value)    || 201521,
                parseFloat(document.getElementById('siProjBottomPrice')?.value) || 27800
            );

            applyStartFilter();
            priceChart.data.datasets[6].data = predLineUSD.map(p => ({ x: p.x, y: p.y * currencyRate }));
            priceChart.update('none');
            updateCurrentStats();
            renderStrategyDashboard();

            if (typeof renderPortfolioEntries === 'function') renderPortfolioEntries();
            if (typeof checkAlerts === 'function') checkAlerts(latestUSD);

            // Signal change alert
            const newSig = signals[signals.length - 1];
            if (_lastKnownSignal !== null && newSig !== _lastKnownSignal) {
                const notifOk = typeof notificationsEnabled === 'function' ? notificationsEnabled() : true;
                const sigLabel = newSig === 'buy' ? '🟢 BUY signal' : '🔴 SELL signal';
                const body = `Strategy switched to ${newSig?.toUpperCase() ?? '—'} at ${fmtPrice(prices[prices.length - 1])}`;
                if (notifOk && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification('BTC Strategy: ' + sigLabel, { body });
                }
                if (typeof _showSignalToast === 'function') _showSignalToast(sigLabel + ' — ' + body);
            }
            _lastKnownSignal = newSig;

            const badge = document.getElementById('liveBadge');
            if (badge) {
                badge.textContent = 'LIVE · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                badge.style.opacity = '1';
            }
        } catch(e) {
            console.warn('Price poll failed:', e);
        }
    }

    if (typeof initSettings === 'function') initSettings();

    // Hand the poll function to settings.js so it can control the interval
    if (typeof startPricePolling === 'function') startPricePolling(_pollPrice);
}

// ── Wrap number inputs with custom +/- buttons ──────────────────────────────
function _wrapNumberInputs() {
    document.querySelectorAll('.si-field input[type=number], .si-trigger-row input[type=number], .si-alloc-item input[type=number]').forEach(inp => {
        if (inp.closest('.num-wrap')) return; // already wrapped
        const wrap = document.createElement('span');
        wrap.className = 'num-wrap';
        wrap.style.display = 'inline-flex';
        wrap.style.width = inp.style.width || '';
        inp.parentNode.insertBefore(wrap, inp);
        wrap.appendChild(inp);

        const btns = document.createElement('span');
        btns.className = 'num-btns';
        btns.innerHTML = '<button type="button" tabindex="-1">\u25B2</button><button type="button" tabindex="-1">\u25BC</button>';
        wrap.appendChild(btns);

        btns.children[0].addEventListener('click', () => {
            inp.stepUp();
            inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
        btns.children[1].addEventListener('click', () => {
            inp.stepDown();
            inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
}

init();
_wrapNumberInputs();
