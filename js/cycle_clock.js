// ── Cycle Clock — "Am I Late?" panel ─────────────────────────────────────────
// Depends on globals: dates, prices, pricesUSD, zArr, zSma, signals (main.js)
//                     HALVINGS, CYCLE_TOPS, SI_PRED_TOP, SI_PRED_BOTTOM (constants.js)
//                     fmtPrice, fmtDate (formatting.js)

function initCycleClock() {
    const el = document.getElementById('cycleClock');
    if (!el) return;
    el.style.display = '';
    updateCycleClock();
}

function updateCycleClock() {
    const el = document.getElementById('cycleClock');
    if (!el || !dates || !dates.length) return;

    const DAY = 86400000;
    const now = Date.now();

    // ── Cycle position ────────────────────────────────────────────────────────
    const halving2024 = HALVINGS[3].ts;                     // Apr 19 2024
    const predTop     = SI_PRED_TOP.ts;                     // Oct 2025 (from constants)
    const predBottom  = SI_PRED_BOTTOM.ts;                  // Nov 2026

    const daysSinceHalving = Math.floor((now - halving2024) / DAY);

    // Typical cycle: halving → top ~535d (actual 2024 cycle), top → bottom ~365d, total ~900d
    const typicalTopDays    = 535;
    const typicalCycleDays  = 900;   // halving to bottom of next bear
    const cyclePct = Math.min(100, Math.round(daysSinceHalving / typicalCycleDays * 100));

    const daysToTop    = Math.max(0, Math.floor((predTop    - now) / DAY));
    const daysToBottom = Math.max(0, Math.floor((predBottom - now) / DAY));

    // ── Z-score risk zone ─────────────────────────────────────────────────────
    const last  = zArr.length - 1;
    const curZ  = zArr[last];
    const curSma = zSma[last];
    const zDiff = (curZ !== null && curSma !== null) ? curZ - curSma : null;

    // Risk based on Z relative to SMA + absolute Z level
    let zone, zoneColor, zoneBg, zoneDesc;
    if (curZ === null) {
        zone = 'Unknown'; zoneColor = '#666'; zoneBg = '#1a1a2e';
        zoneDesc = 'Insufficient data';
    } else if (curZ < 0) {
        zone = 'Deep Value'; zoneColor = '#00ff88'; zoneBg = 'rgba(0,255,136,.08)';
        zoneDesc = 'Price historically cheap — strong accumulation zone';
    } else if (curZ < 1.5) {
        zone = 'Accumulate'; zoneColor = '#00cc66'; zoneBg = 'rgba(0,204,102,.08)';
        zoneDesc = 'Below historical average — good entry territory';
    } else if (curZ < 3.0) {
        zone = 'Neutral'; zoneColor = '#f7931a'; zoneBg = 'rgba(247,147,26,.08)';
        zoneDesc = 'Mid-cycle — reasonable entry, higher risk than early cycle';
    } else if (curZ < 5.0) {
        zone = 'Caution'; zoneColor = '#ff8800'; zoneBg = 'rgba(255,136,0,.08)';
        zoneDesc = 'Elevated — consider smaller positions, plan exits';
    } else {
        zone = 'Danger'; zoneColor = '#ff4444'; zoneBg = 'rgba(255,68,68,.08)';
        zoneDesc = 'Historically overheated — reduce exposure, protect gains';
    }

    // ── Signal context ────────────────────────────────────────────────────────
    const curSig = signals[signals.length - 1];
    const sigLabel = curSig === 'buy' ? 'BUY' : curSig === 'sell' ? 'SELL' : '—';
    const sigColor = curSig === 'buy' ? '#00ff88' : curSig === 'sell' ? '#ff4444' : '#555';

    // ── Current price context ─────────────────────────────────────────────────
    const curPriceUSD = pricesUSD[pricesUSD.length - 1];
    const predTopUSD  = SI_PRED_TOP.priceUSD;
    const pctOfTop    = Math.round(curPriceUSD / predTopUSD * 100);

    // ── 200W MA (power-law floor) ─────────────────────────────────────────────
    const WIN200W = 1400;
    let ma200w = null;
    if (pricesUSD.length >= WIN200W) {
        let s = 0;
        for (let i = pricesUSD.length - WIN200W; i < pricesUSD.length; i++) s += pricesUSD[i];
        ma200w = s / WIN200W;
    }
    const ma200wRatio = ma200w ? curPriceUSD / ma200w : null;
    // Historical bottom ratios: 2015=0.78, 2018=0.98, 2022=0.65 — avg ~0.80
    const atMaFloor = ma200wRatio !== null && ma200wRatio < 1.05;

    // ── Power law ratio (Cowen HTF model) ────────────────────────────────────
    // ln(P) = -37.3954 + 5.6116 * ln(days since genesis)
    const genesisMs = new Date('2009-01-03').getTime();
    const tDays = (now - genesisMs) / DAY;
    const plFairValue = Math.exp(-37.3954 + 5.6116 * Math.log(tDays));
    const plRatio = curPriceUSD / plFairValue;
    // Historical bottoms: 0.455 (2015), 0.567 (2018), 0.436 (2022) — we're at ~0.47 = bottom zone

    // ── Bottom zone context ───────────────────────────────────────────────────
    const pastBottom  = now > predBottom;
    const nearBottom  = !pastBottom && daysToBottom < 120;
    const inBottomZone = plRatio < 0.55 && atMaFloor;

    // ── Progress bar segments ─────────────────────────────────────────────────
    // Phase widths as % of total cycle (900d)
    const bullPhasePct  = Math.round(typicalTopDays    / typicalCycleDays * 100); // ~59%
    const bearPhasePct  = 100 - bullPhasePct;
    const progressPct   = Math.min(100, daysSinceHalving / typicalCycleDays * 100);

    // Are we past predicted top already?
    const pastTop = now > predTop;

    // ── Advice text ───────────────────────────────────────────────────────────
    let adviceText = zoneDesc;
    if (inBottomZone) {
        adviceText = `Power law ratio ${plRatio.toFixed(2)}× (bottoms historically 0.44–0.57×) and price at 200W MA — this IS the bear floor zone. Cowen model: bottom range $${(SI_PRED_BOTTOM.rangeLow/1000).toFixed(0)}k–$${(SI_PRED_BOTTOM.rangeHigh/1000).toFixed(0)}k.`;
    } else if (nearBottom && !inBottomZone) {
        adviceText = `Approaching predicted bear bottom zone ($${(SI_PRED_BOTTOM.rangeLow/1000).toFixed(0)}k–$${(SI_PRED_BOTTOM.rangeHigh/1000).toFixed(0)}k). Power law ratio: ${plRatio.toFixed(2)}×.`;
    }

    el.innerHTML = `
        <div class="cc-header">
            <div class="cc-title">Cycle Clock — Am I Late?</div>
            <div class="cc-zone-badge" style="color:${zoneColor};background:${zoneBg};border-color:${zoneColor}44">
                ${zone}
            </div>
        </div>

        <div class="cc-grid">

            <div class="cc-card">
                <div class="cc-card-label">Days Since Halving</div>
                <div class="cc-card-value" style="color:#f7931a">${daysSinceHalving.toLocaleString()}</div>
                <div class="cc-card-sub">of ~${typicalTopDays}d typical bull run</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">Cycle Progress</div>
                <div class="cc-card-value" style="color:#ddd">${cyclePct}%</div>
                <div class="cc-card-sub">halving → bear bottom</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">${pastTop ? 'Days Past Top' : 'Days to Pred. Top'}</div>
                <div class="cc-card-value" style="color:${pastTop ? '#ff8800' : '#00cc66'}">${pastTop ? Math.floor((now - predTop)/DAY).toLocaleString() : daysToTop.toLocaleString()}</div>
                <div class="cc-card-sub">${fmtDate(predTop)}</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">${pastBottom ? 'Days Past Bottom' : 'Days to Pred. Bottom'}</div>
                <div class="cc-card-value" style="color:${inBottomZone ? '#00ff88' : pastBottom ? '#aaa' : '#5599ff'}">${pastBottom ? Math.floor((now - predBottom)/DAY).toLocaleString() : daysToBottom.toLocaleString()}</div>
                <div class="cc-card-sub">${fmtDate(predBottom)} · $${(SI_PRED_BOTTOM.rangeLow/1000).toFixed(0)}k–$${(SI_PRED_BOTTOM.rangeHigh/1000).toFixed(0)}k range</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">Power Law Ratio</div>
                <div class="cc-card-value" style="color:${plRatio < 0.55 ? '#00ff88' : plRatio < 0.80 ? '#00cc66' : plRatio < 1.20 ? '#f7931a' : '#ff4444'}">${plRatio.toFixed(2)}×</div>
                <div class="cc-card-sub">bottoms: 0.44–0.57× fair value</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">200W MA</div>
                <div class="cc-card-value" style="color:${atMaFloor ? '#00ff88' : '#f7931a'}">${ma200w ? fmtPrice(ma200w) : '—'}</div>
                <div class="cc-card-sub">${ma200wRatio !== null ? (ma200wRatio >= 1 ? '+' : '') + ((ma200wRatio - 1)*100).toFixed(0) + '% vs MA floor' : 'historical bear floor'}</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">Z-Score</div>
                <div class="cc-card-value" style="color:${zoneColor}">${curZ !== null ? curZ.toFixed(2) : '—'}</div>
                <div class="cc-card-sub">vs SMA ${curSma !== null ? (zDiff >= 0 ? '+' : '') + zDiff.toFixed(2) : '—'}</div>
            </div>

            <div class="cc-card">
                <div class="cc-card-label">Strategy Signal</div>
                <div class="cc-card-value" style="color:${sigColor}">${sigLabel}</div>
                <div class="cc-card-sub">Z-cross momentum</div>
            </div>

        </div>

        <div class="cc-bar-wrap">
            <div class="cc-bar-labels">
                <span>Halving Apr 2024</span>
                <span>Pred. Top ${fmtDate(predTop)}</span>
                <span>Pred. Bottom ${fmtDate(predBottom)}</span>
            </div>
            <div class="cc-bar-track">
                <div class="cc-bar-bull"  style="width:${bullPhasePct}%"></div>
                <div class="cc-bar-bear"  style="width:${bearPhasePct}%"></div>
                <div class="cc-bar-now"   style="left:${progressPct.toFixed(1)}%"></div>
            </div>
            <div class="cc-bar-sublabels">
                <span style="color:#00cc6699">◀ Bull run (accumulate → reduce)</span>
                <span style="color:#cc333399">Bear (wait for next bottom) ▶</span>
            </div>
        </div>

        <div class="cc-advice">
            <span class="cc-advice-icon" style="color:${inBottomZone ? '#00ff88' : zoneColor}">●</span>
            <span>${adviceText}</span>
            ${curSig === 'buy'
                ? ' The momentum signal is <strong style="color:#00ff88">active</strong> — strategy is in the market.'
                : ' The momentum signal is <strong style="color:#ff4444">inactive</strong> — strategy is in cash.'}
        </div>
    `;
}
