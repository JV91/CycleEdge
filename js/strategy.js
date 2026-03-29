// ── Investment Strategy Dashboard ─────────────────────────────────────────────
// Depends on globals: SI_EXITS, SI_PRED_BOTTOM, SI_PRED_TOP, SI_HALVING (constants.js)
//                     siGetPredPriceUSD (prediction.js)
//                     fmtSI (formatting.js)
//                     currencyRate, predLineUSD (main.js)

let siChart = null;

function siAddMonths(ts, n) {
    const d = new Date(ts);
    d.setMonth(d.getMonth() + n);
    return d.getTime();
}

function siMonthLabel(ts) {
    return new Date(ts).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function siPhase(ts) {
    const tStop = siAddMonths(SI_PRED_TOP.ts, -parseInt(document.getElementById('siStopOffset').value));
    if (ts < SI_PRED_BOTTOM.ts + 30 * 86400000) return 'acc';   // accumulation (bear)
    if (ts < SI_HALVING.ts)                      return 'acc';   // pre-halving
    if (ts < tStop)                              return 'bull';  // bull run buying
    const exitDone = SI_PRED_TOP.ts + 90 * 86400000;
    if (ts <= exitDone)                          return 'exit';
    return 'hold';
}

function siBuildPlan() {
    const lumpSum  = Math.max(0, parseFloat(document.getElementById('siLumpSum').value)  || 0);
    const monthly  = Math.max(0, parseFloat(document.getElementById('siMonthly').value)  || 0);
    const startVal = document.getElementById('siStartDate').value; // 'YYYY-MM'
    const stopMo   = parseInt(document.getElementById('siStopOffset').value);
    const allocDirect = Math.max(0, parseFloat(document.getElementById('allocBTCDirect').value) || 0);
    const allocLev    = Math.max(0, parseFloat(document.getElementById('allocBTCLev').value)    || 0);
    const allocMSTR   = Math.max(0, parseFloat(document.getElementById('allocMSTR').value)      || 0);
    const btcLev  = parseFloat(document.getElementById('btcLevMult').value);
    const mstrMul = parseFloat(document.getElementById('mstrLevMult').value);
    const projTopUSD = Math.max(50000, parseFloat(document.getElementById('siProjTopPrice').value) || SI_PRED_TOP.priceUSD);
    const holdLevUntilTop  = document.getElementById('siHoldLevTop').checked;
    const holdMstrUntilTop = document.getElementById('siHoldMstrTop').checked;

    // Opportunistic bottom entries
    const mkDate = id => { const v = document.getElementById(id).value; if (!v) return Infinity; const [y,m] = v.split('-').map(Number); return new Date(y,m-1,1).getTime(); };
    const oppMstrAmt  = Math.max(0, parseFloat(document.getElementById('siOppMstrAmt').value)  || 0);
    const oppMstrDate = mkDate('siOppMstrDate');
    const oppLevAmt   = Math.max(0, parseFloat(document.getElementById('siOppLevAmt').value)   || 0);
    const oppLevDate  = mkDate('siOppLevDate');

    // Z-score strategy signal integration
    const useZSignals  = document.getElementById('siUseZSignals').checked;
    const zSigBuyAmt   = Math.max(0, parseFloat(document.getElementById('siZSigBuyAmt').value)  || 0);
    const zSigSellFrac = (parseFloat(document.getElementById('siZSigSellPct').value) || 0) / 100;

    // Additional manual signal rules
    const sigBuyDipPct    = parseFloat(document.getElementById('siSigBuyDipPct').value)    || 0;
    const sigBuyAmt       = Math.max(0, parseFloat(document.getElementById('siSigBuyAmt').value) || 0);
    const sigSellDropPct  = parseFloat(document.getElementById('siSigSellDropPct').value)  || 0;
    const sigSellThresh   = parseFloat(document.getElementById('siSigSellThresh').value)   || 70;
    const sigSellFrac     = (parseFloat(document.getElementById('siSigSellPct').value)     || 0) / 100;

    // Pre-index predSignals by month for O(1) lookup in the loop
    const zSigByMonth = new Map();
    if (useZSignals && typeof predSignals !== 'undefined') {
        for (const ev of predSignals) {
            // bucket to month start
            const d = new Date(ev.ts); d.setDate(1); d.setHours(0,0,0,0);
            zSigByMonth.set(d.getTime(), ev.signal);
        }
    }

    const allocTotal = allocDirect + allocLev + allocMSTR;
    document.getElementById('allocWarn').textContent =
        Math.abs(allocTotal - 100) > 0.5 ? `⚠ Allocations sum to ${allocTotal}% (should be 100%)` : '';

    if (!startVal) return null;
    const [sy, sm] = startVal.split('-').map(Number);
    const tStart = new Date(sy, sm - 1, 1).getTime();
    const tStop  = siAddMonths(SI_PRED_TOP.ts, -stopMo);
    const tEnd   = siAddMonths(SI_PRED_TOP.ts, 4); // show 4 months after top

    // Lump sum price-target triggers — each fires when BTC ≤ targetUSD OR backstop month reached
    const lumpTranche = lumpSum / 3;
    const mkBackstop = id => {
        const v = document.getElementById(id).value;
        if (!v) return Infinity;
        const [y, m] = v.split('-').map(Number);
        return new Date(y, m - 1, 1).getTime();
    };
    const lumpTranches = [
        { priceUSD: parseFloat(document.getElementById('siT1Price').value) || Infinity, backstop: mkBackstop('siT1Backstop'), fired: false, label: 'T1' },
        { priceUSD: parseFloat(document.getElementById('siT2Price').value) || Infinity, backstop: mkBackstop('siT2Backstop'), fired: false, label: 'T2' },
        { priceUSD: parseFloat(document.getElementById('siT3Price').value) || Infinity, backstop: mkBackstop('siT3Backstop'), fired: false, label: 'T3' },
    ];

    // Build monthly timeline
    const months = [];
    let t = tStart;
    while (t <= tEnd) { months.push(t); t = siAddMonths(t, 1); }

    // State
    let btcDirectHeld = 0;
    let levInvested = 0, levAvgEntryUSD = 0;
    let mstrInvested = 0, mstrAvgEntryUSD = 0;
    let totalInvested = 0;
    let exitProceeds = 0; // cash realized from exits (in current currency)
    let remainFracD    = 1.0; // BTC direct remaining fraction
    let remainFracLev  = 1.0; // BTC leveraged remaining fraction
    let remainFracMstr = 1.0; // MSTR remaining fraction
    const appliedExits = new Set();
    const rate = currencyRate;

    // Opportunistic entry flags
    let oppMstrFired = false;
    let oppLevFired  = false;

    // Signal state
    let priceHWM     = 0;   // high-water mark for dip-buy detection
    let prevPriceUSD = 0;   // previous month's price for momentum-sell detection
    const appliedSigSells = new Set(); // deduplicate signal sells per month

    const rows = [];
    const chartPts = { total: [], btcD: [], btcL: [], mstr: [], invested: [], holdingsOnly: [] };

    for (const t of months) {
        const priceUSD = siGetPredPriceUSD(t);
        if (!priceUSD) continue;
        const price = priceUSD * rate; // in current currency

        // Lump sum price-target triggers
        let lumpThis = 0;
        let lumpNote = '';
        for (const tr of lumpTranches) {
            if (!tr.fired && t >= tStart && (priceUSD <= tr.priceUSD || t >= tr.backstop)) {
                lumpThis += lumpTranche;
                tr.fired = true;
                const reason = priceUSD <= tr.priceUSD
                    ? `${fmtPrice(priceUSD)} ≤ target`
                    : 'backstop date';
                lumpNote = `Lump sum ${tr.label} (${reason})`;
            }
        }

        // Monthly contribution (only during buying phase)
        const monthlyThis = t <= tStop ? monthly : 0;
        const isLastMonthlyBuy = monthlyThis > 0 && siAddMonths(t, 1) > tStop;
        const deployThis = lumpThis + monthlyThis;

        let note = lumpNote || (isLastMonthlyBuy ? 'Last monthly buy' : '');
        let btcBought = 0;

        // Helper: invest into leveraged bucket
        const addToLev = (amt) => {
            const prev = levInvested;
            levInvested += amt;
            levAvgEntryUSD = prev === 0 ? priceUSD : (levAvgEntryUSD * prev + priceUSD * amt) / levInvested;
        };
        // Helper: invest into MSTR bucket
        const addToMstr = (amt) => {
            const prev = mstrInvested;
            mstrInvested += amt;
            mstrAvgEntryUSD = prev === 0 ? priceUSD : (mstrAvgEntryUSD * prev + priceUSD * amt) / mstrInvested;
        };

        if (deployThis > 0) {
            const dDirect = deployThis * (allocDirect / 100);
            const dLev    = deployThis * (allocLev    / 100);
            const dMSTR   = deployThis * (allocMSTR   / 100);

            btcBought = dDirect / price;
            btcDirectHeld += btcBought;
            if (dLev  > 0) addToLev(dLev);
            if (dMSTR > 0) addToMstr(dMSTR);
            totalInvested += deployThis;
        }

        // Opportunistic bottom entries (one-time, at specified date)
        if (oppMstrAmt > 0 && !oppMstrFired && t >= oppMstrDate) {
            addToMstr(oppMstrAmt);
            totalInvested += oppMstrAmt;
            oppMstrFired = true;
            note = (note ? note + ' · ' : '') + `MSTR entry ${fmtSI(oppMstrAmt)}`;
        }
        if (oppLevAmt > 0 && !oppLevFired && t >= oppLevDate) {
            addToLev(oppLevAmt);
            totalInvested += oppLevAmt;
            oppLevFired = true;
            note = (note ? note + ' · ' : '') + `Lev BTC entry ${fmtSI(oppLevAmt)}`;
        }

        // Signal buy: dip from high-water mark
        if (sigBuyAmt > 0 && sigBuyDipPct > 0 && priceHWM > 0 && priceUSD <= priceHWM * (1 - sigBuyDipPct / 100)) {
            const dDirect = sigBuyAmt * (allocDirect / 100);
            const dLev    = sigBuyAmt * (allocLev    / 100);
            const dMSTR   = sigBuyAmt * (allocMSTR   / 100);
            btcBought += dDirect / price;
            btcDirectHeld += dDirect / price;
            if (dLev  > 0) addToLev(dLev);
            if (dMSTR > 0) addToMstr(dMSTR);
            totalInvested += sigBuyAmt;
            note = (note ? note + ' · ' : '') + `Signal buy (−${Math.round((1 - priceUSD / priceHWM) * 100)}% dip)`;
            priceHWM = priceUSD; // reset so it won't re-fire until price recovers
        }
        priceHWM = Math.max(priceHWM, priceUSD);

        // Z-score strategy signals
        const zSig = zSigByMonth.get(t);
        if (zSig === 'buy' && zSigBuyAmt > 0) {
            const dDirect = zSigBuyAmt * (allocDirect / 100);
            const dLev    = zSigBuyAmt * (allocLev    / 100);
            const dMSTR   = zSigBuyAmt * (allocMSTR   / 100);
            btcBought += dDirect / price;
            btcDirectHeld += dDirect / price;
            if (dLev  > 0) addToLev(dLev);
            if (dMSTR > 0) addToMstr(dMSTR);
            totalInvested += zSigBuyAmt;
            note = (note ? note + ' · ' : '') + `Z-signal BUY ${fmtSI(zSigBuyAmt)}`;
        }

        // Helper: full (unreduced) value of each bucket at current price
        const fullBtcD  = btcDirectHeld * price;
        const fullLev   = levInvested > 0 && levAvgEntryUSD > 0
            ? levInvested * Math.max(0, 1 + btcLev  * (priceUSD / levAvgEntryUSD  - 1))
            : 0;
        const fullMstr  = mstrInvested > 0 && mstrAvgEntryUSD > 0
            ? mstrInvested * Math.max(0, 1 + mstrMul * (priceUSD / mstrAvgEntryUSD - 1))
            : 0;
        // Tiered exits — per-bucket remainFrac; MSTR/Lev can be locked until final tier
        for (let ei = 0; ei < SI_EXITS.length; ei++) {
            if (appliedExits.has(ei)) continue;
            const exitPriceUSD = projTopUSD * SI_EXITS[ei].pricePctOfTop;
            const isFinalTier  = SI_EXITS[ei].pricePctOfTop >= 1.0;
            if (priceUSD >= exitPriceUSD) {
                const fraction = SI_EXITS[ei].sellPct;
                appliedExits.add(ei);
                exitProceeds += fullBtcD * fraction;
                remainFracD  -= fraction;
                if (!holdLevUntilTop || isFinalTier) {
                    exitProceeds += fullLev * fraction;
                    remainFracLev -= fraction;
                }
                if (!holdMstrUntilTop || isFinalTier) {
                    exitProceeds += fullMstr * fraction;
                    remainFracMstr -= fraction;
                }
                note = SI_EXITS[ei].label + ` — sell ${fraction * 100}%`;
            }
        }

        // Z-score strategy sell signal
        if (zSig === 'sell' && zSigSellFrac > 0 && remainFracD > 0.01) {
            exitProceeds += fullBtcD * zSigSellFrac;
            remainFracD  -= zSigSellFrac;
            if (!holdLevUntilTop) { exitProceeds += fullLev  * zSigSellFrac; remainFracLev  -= zSigSellFrac; }
            if (!holdMstrUntilTop){ exitProceeds += fullMstr * zSigSellFrac; remainFracMstr -= zSigSellFrac; }
            note = (note ? note + ' · ' : '') + `Z-signal SELL ${Math.round(zSigSellFrac * 100)}%`;
        }

        // Signal sell: momentum drop while above threshold % of projected top
        if (
            sigSellFrac > 0 && sigSellDropPct > 0 && remainFracD > 0.01 &&
            prevPriceUSD > 0 &&
            priceUSD >= projTopUSD * (sigSellThresh / 100) &&
            priceUSD <= prevPriceUSD * (1 - sigSellDropPct / 100) &&
            !appliedSigSells.has(t)
        ) {
            exitProceeds += fullBtcD * sigSellFrac;
            remainFracD  -= sigSellFrac;
            if (!holdLevUntilTop) { exitProceeds += fullLev  * sigSellFrac; remainFracLev  -= sigSellFrac; }
            if (!holdMstrUntilTop){ exitProceeds += fullMstr * sigSellFrac; remainFracMstr -= sigSellFrac; }
            appliedSigSells.add(t);
            note = (note ? note + ' · ' : '') + `Signal sell −${Math.round((1 - priceUSD / prevPriceUSD) * 100)}% drop`;
        }
        prevPriceUSD = priceUSD;

        // Current values = full value × per-bucket remaining fraction
        const btcDValue = fullBtcD  * remainFracD;
        const levValue  = fullLev   * remainFracLev;
        const mstrValue = fullMstr  * remainFracMstr;
        const totalValue = btcDValue + levValue + mstrValue + exitProceeds;

        chartPts.total.push({ x: t, y: Math.round(totalValue) });
        chartPts.btcD.push({ x: t, y: Math.round(btcDValue) });
        chartPts.btcL.push({ x: t, y: Math.round(levValue) });
        chartPts.mstr.push({ x: t, y: Math.round(mstrValue) });
        chartPts.invested.push({ x: t, y: Math.round(totalInvested) });
        chartPts.holdingsOnly.push({ x: t, y: Math.round(btcDValue + levValue + mstrValue) });

        rows.push({
            ts: t, phase: siPhase(t),
            deployThis, price, btcBought,
            btcTotal: btcDirectHeld,
            totalValue, note
        });
    }

    // Summary stats
    const peakTotal = Math.max(...chartPts.total.map(p => p.y));

    // Values at each exit tier
    const tierVals = [];
    for (const ex of SI_EXITS) {
        const exitPriceUSD = projTopUSD * ex.pricePctOfTop;
        const exitPt = chartPts.total.find(p => siGetPredPriceUSD(p.x) >= exitPriceUSD);
        tierVals.push(exitPt ? exitPt.y : null);
    }

    const btcAvgEntry = btcDirectHeld > 0
        ? (totalInvested * (allocDirect / 100)) / btcDirectHeld
        : 0;

    return { chartPts, rows, totalInvested, btcDirectHeld, btcAvgEntry, peakTotal, tierVals, remainFracD, remainFracLev, remainFracMstr, rate, lumpTranches };
}

function renderStrategyDashboard() {
    if (!predLineUSD) return; // data not ready yet

    const plan = siBuildPlan();
    if (!plan) return;
    const { chartPts, rows, totalInvested, btcDirectHeld, btcAvgEntry, peakTotal, tierVals, remainFracD, remainFracLev, remainFracMstr, lumpTranches } = plan;

    // Show/hide trigger fired indicators
    lumpTranches.forEach((tr, i) => {
        const el = document.getElementById(`siT${i + 1}Status`);
        if (el) el.style.display = tr.fired ? 'inline' : 'none';
    });

    // Show predicted Z-signal dates
    const sigDateEl = document.getElementById('siZSigDateList');
    if (sigDateEl && typeof predSignals !== 'undefined' && predSignals.length > 0) {
        sigDateEl.textContent = predSignals
            .map(ev => `${siMonthLabel(ev.ts)} (${ev.signal.toUpperCase()})`)
            .join(' → ');
    } else if (sigDateEl) {
        sigDateEl.textContent = 'none detected in prediction window';
    }

    // Per-tranche amount label
    const lumpSum = Math.max(0, parseFloat(document.getElementById('siLumpSum').value) || 0);
    document.getElementById('siTrancheAmt').textContent = fmtSI(lumpSum / 3) + ' per tranche';

    // Update stats
    document.getElementById('siTotalInvest').textContent = fmtSI(totalInvested);
    document.getElementById('siBTCAccum').textContent    = btcDirectHeld > 0 ? btcDirectHeld.toFixed(4) + ' BTC' : '—';
    document.getElementById('siAvgEntry').textContent    = btcAvgEntry > 0 ? fmtSI(btcAvgEntry) : '—';
    document.getElementById('siTier1Val').textContent    = fmtSI(tierVals[0]);
    document.getElementById('siTier2Val').textContent    = fmtSI(tierVals[1]);
    document.getElementById('siTier3Val').textContent    = fmtSI(tierVals[2]);
    const holdParts = [`BTC ${Math.round(remainFracD * 100)}%`];
    if (remainFracLev  > 0) holdParts.push(`Lev ${Math.round(remainFracLev  * 100)}%`);
    if (remainFracMstr > 0) holdParts.push(`MSTR ${Math.round(remainFracMstr * 100)}%`);
    document.getElementById('siHoldLabel').textContent   = holdParts.join(' · ') + ' remaining';
    document.getElementById('siHoldVal').textContent     = fmtSI(chartPts.holdingsOnly[chartPts.holdingsOnly.length - 1]?.y);
    document.getElementById('siPeakVal').textContent     = fmtSI(peakTotal);
    const ret = totalInvested > 0 ? ((peakTotal / totalInvested - 1) * 100) : 0;
    document.getElementById('siReturn').textContent      = ret > 0 ? '+' + Math.round(ret) + '%' : '—';

    // Render chart
    const ds = [
        { label: 'Total Portfolio', data: chartPts.total,    borderColor: '#ffffff',   backgroundColor: '#ffffff11', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 },
        { label: 'BTC Direct',      data: chartPts.btcD,     borderColor: '#00cc66',   borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'BTC Leveraged',   data: chartPts.btcL,     borderColor: '#f7931a',   borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'MSTR',            data: chartPts.mstr,     borderColor: '#5577ff',   borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'Cost Basis',      data: chartPts.invested, borderColor: '#444466',   borderWidth: 1, borderDash: [4,3], pointRadius: 0, fill: false, tension: 0 },
    ];

    if (!siChart) {
        const ctx = document.getElementById('siChart').getContext('2d');
        siChart = new Chart(ctx, {
            type: 'line',
            data: { datasets: ds },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'time', time: { unit: 'year' }, grid: { color: '#111120' },
                         ticks: { color: '#3a3a5a', font: { size: 11 }, maxRotation: 0 } },
                    y: { grid: { color: '#111120' },
                         ticks: { color: '#3a3a5a', font: { size: 11 },
                                  callback: v => fmtSI(v) } }
                },
                plugins: {
                    legend: { display: true, labels: { color: '#666', font: { size: 11 }, boxWidth: 20, padding: 14 } },
                    tooltip: {
                        backgroundColor: '#131320', borderColor: '#2a2a42', borderWidth: 1,
                        titleColor: '#666', bodyColor: '#ccc', padding: 10,
                        callbacks: {
                            title: items => siMonthLabel(items[0].parsed.x),
                            label: ctx => ` ${ctx.dataset.label}: ${fmtSI(ctx.parsed.y)}`
                        }
                    }
                }
            }
        });
    } else {
        siChart.data.datasets = ds;
        siChart.update('none');
    }

    // ── Trade schedule table ──────────────────────────────────────────────────
    const tbody = document.getElementById('siTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const nowTs = Date.now();
    const phaseLabel = { acc: 'Accumulate', bull: 'Bull Run', exit: 'Exit', hold: 'Hold' };
    const phaseClass = { acc: 'acc', bull: 'bull', exit: 'exit', hold: 'hold' };

    // Key rows: any trade action, milestone dates, or today boundary
    const milestones = [SI_PRED_BOTTOM.ts, SI_HALVING.ts, SI_PRED_TOP.ts];
    let pastInserted = false;

    const keyRows = rows.filter(r =>
        r.deployThis > 0 ||
        (r.note && r.note.trim()) ||
        milestones.some(t => Math.abs(t - r.ts) < 20 * 86400000)
    );

    keyRows.forEach(r => {
        // Insert a "TODAY" divider row once
        if (!pastInserted && r.ts > nowTs) {
            pastInserted = true;
            const divider = document.createElement('tr');
            divider.innerHTML = `<td colspan="9" style="text-align:center;color:#f7931a88;font-size:0.68rem;padding:4px 0;border-top:1px dashed #f7931a44;letter-spacing:1px">▼ FUTURE</td>`;
            tbody.appendChild(divider);
        }

        const isBuy  = r.deployThis > 0;
        const isExit = r.note && r.note.toLowerCase().includes('sell');
        const isPast = r.ts <= nowTs;

        const tr = document.createElement('tr');
        tr.className = isExit ? 'si-row-exit' : isBuy ? `si-row-${r.phase}` : '';
        if (isPast) tr.style.opacity = '0.45';

        tr.innerHTML = `
            <td>${siMonthLabel(r.ts)}</td>
            <td><span class="phase-badge ${phaseClass[r.phase]}">${phaseLabel[r.phase]}</span></td>
            <td class="${isBuy ? 'buy-cell' : isExit ? 'sell-cell' : ''}">${isBuy ? '▲ Buy' : isExit ? '▼ Sell' : '·'}</td>
            <td class="${isBuy ? 'buy-cell' : ''}">${isBuy ? fmtSI(r.deployThis) : '—'}</td>
            <td class="btc-cell">${fmtSI(r.price)}</td>
            <td class="btc-cell">${r.btcBought > 0 ? r.btcBought.toFixed(5) : '—'}</td>
            <td class="btc-cell">${r.btcTotal.toFixed(4)}</td>
            <td>${fmtSI(r.totalValue)}</td>
            <td class="note-cell">${r.note || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Wire up all SI inputs
['siLumpSum','siMonthly','siStartDate','siStopOffset','siProjBottomPrice','siProjTopPrice',
 'siT1Price','siT1Backstop','siT2Price','siT2Backstop','siT3Price','siT3Backstop',
 'allocBTCDirect','allocBTCLev','allocMSTR','btcLevMult','mstrLevMult',
 'siOppMstrAmt','siOppMstrDate','siOppLevAmt','siOppLevDate',
 'siUseZSignals','siZSigBuyAmt','siZSigSellPct',
 'siSigBuyDipPct','siSigBuyAmt','siSigSellDropPct','siSigSellThresh','siSigSellPct',
 'siHoldLevTop','siHoldMstrTop'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { renderStrategyDashboard(); if (id === 'btcLevMult' && typeof updatePerfStats === 'function') updatePerfStats(); });
    if (el) el.addEventListener('input',  () => { renderStrategyDashboard(); if (id === 'btcLevMult' && typeof updatePerfStats === 'function') updatePerfStats(); });
});
