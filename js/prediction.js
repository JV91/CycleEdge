// ── Prediction line ───────────────────────────────────────────────────────────
// Depends on globals: dates, pricesUSD (set in main.js after data load)
//
// Method: Cycle Repeat — propagate weekly price ratios from the 2020 cycle
// (aligned by halving date) starting from current real price.
// Source: bitbo.io/cycle-repeat — previous cycle shape scaled to current cycle.

function generatePredictionLine(projectedTopUSD = 200000, projectedBottomUSD = 27800) {
    const halving2020 = new Date('2020-05-11').getTime();
    const halving2024 = new Date('2024-04-19').getTime();
    const halving2028 = new Date('2028-04-18').getTime();

    const tNow = dates[dates.length - 1];
    const pNow = pricesUSD[pricesUSD.length - 1];
    const DAY  = 86400000;
    const STEP = 7 * DAY;   // weekly steps

    // Interpolate USD price at an arbitrary timestamp from real data (log-linear)
    function interpPrice(ts) {
        if (ts < dates[0] || ts > dates[dates.length - 1]) return null;
        let lo = 0, hi = dates.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (dates[mid] <= ts) lo = mid; else hi = mid;
        }
        const span = dates[hi] - dates[lo];
        const frac = span > 0 ? (ts - dates[lo]) / span : 0;
        return pricesUSD[lo] * Math.pow(pricesUSD[hi] / pricesUSD[lo], frac);
    }

    // End at ~450 days past the 2028 halving (covers the next bull run top)
    const tEnd = halving2028 + 450 * DAY;

    const pts = [{ x: tNow, y: Math.round(pNow) }];
    let curPrice = pNow;

    for (let t = tNow + STEP; t <= tEnd; t += STEP) {
        const offsetMs  = t - halving2024;
        const prevTs     = halving2020 + offsetMs;
        const prevTsPrev = prevTs - STEP;

        const pB = interpPrice(prevTs);
        const pA = interpPrice(prevTsPrev);

        if (pA !== null && pB !== null && pA > 0 && pB > 0) {
            // Apply same weekly ratio from the 2020 cycle
            curPrice = curPrice * (pB / pA);
        } else {
            // Past our historical data (equivalent date > Apr 2024 in 2020 cycle ≈ Sep 2028 in current)
            // Piecewise exponential for post-2028-halving bull run
            const tTopEst = halving2028 + 500 * DAY;
            const tDecEnd = tTopEst + 420 * DAY;
            if (t <= tTopEst) {
                const prog = (t - (halving2028 + 30 * DAY)) / (tTopEst - (halving2028 + 30 * DAY));
                const pHalv = projectedTopUSD * 0.42;
                curPrice = pHalv * Math.pow(projectedTopUSD / pHalv, Math.max(0, Math.pow(prog, 0.65)));
            } else {
                const prog = Math.min(1, (t - tTopEst) / (tDecEnd - tTopEst));
                curPrice = projectedTopUSD * Math.pow(projectedTopUSD * 0.30 / projectedTopUSD, Math.pow(prog, 0.8));
            }
        }

        pts.push({ x: t, y: Math.round(Math.max(1000, curPrice)) });
    }

    // Scale the trough region so the minimum of the predicted decline matches projectedBottomUSD.
    // Only adjust the bear phase (points below current price) to avoid distorting the bull run.
    const bearPts = pts.filter(p => p.y < pNow);
    if (bearPts.length > 0) {
        const rawBottom = Math.min(...bearPts.map(p => p.y));
        if (rawBottom > 0 && rawBottom !== projectedBottomUSD) {
            const scale = projectedBottomUSD / rawBottom;
            for (const p of pts) {
                if (p.y < pNow) {
                    // Blend the correction: full scale at the trough, taper off toward pNow
                    const depth = Math.log(pNow / p.y) / Math.log(pNow / rawBottom); // 0→1 as price→bottom
                    const s = Math.pow(scale, depth);
                    p.y = Math.round(p.y * s);
                }
            }
        }
    }

    return pts;
}

// ── Predicted Z-score signals ────────────────────────────────────────────────
// Depends on globals: dates, pricesUSD (real history), predLineUSD (prediction.js)
//                     computeSignals (indicators.js)
// Returns array of { ts, signal: 'buy'|'sell' } for crossover events in future

function generatePredictedSignals(zWin, smaWin, entryBuf, exitBuf) {
    if (!predLineUSD || predLineUSD.length === 0) return [];

    const DAY = 86400000;
    const tNow = dates[dates.length - 1];

    // Build daily predicted price series starting right after real data
    const futurePts = [];
    let t = tNow + DAY;
    while (t <= predLineUSD[predLineUSD.length - 1].x) {
        futurePts.push({ x: t, y: siGetPredPriceUSD(t) });
        t += DAY;
    }

    // Stitch: enough real history for the rolling window + all predicted days
    const lookback = Math.max(zWin, smaWin) + 10;
    const realSlice = pricesUSD.slice(-lookback);
    const combined  = realSlice.concat(futurePts.map(p => p.y));
    const combDates = dates.slice(-lookback).concat(futurePts.map(p => p.x));

    const result   = computeSignals(combined, zWin, smaWin, entryBuf, exitBuf);
    const sigArr   = result.signals;

    // Extract crossover events only in the future portion
    const futureStart = realSlice.length;
    const events = [];
    for (let i = futureStart; i < sigArr.length; i++) {
        if (sigArr[i] === null) continue;
        const prev = sigArr[i - 1];
        if (prev !== null && sigArr[i] !== prev) {
            events.push({ ts: combDates[i], signal: sigArr[i] });
        }
    }
    return events;
}

// ── SI prediction price interpolation ────────────────────────────────────────
// Depends on global: predLineUSD (set in main.js)

function siGetPredPriceUSD(tsMs) {
    // Interpolate from predLineUSD (or fall back to piecewise)
    if (!predLineUSD || predLineUSD.length === 0) return null;
    // clamp to range
    if (tsMs <= predLineUSD[0].x)                    return predLineUSD[0].y;
    if (tsMs >= predLineUSD[predLineUSD.length - 1].x) return predLineUSD[predLineUSD.length - 1].y;
    // find surrounding points and interpolate on log scale
    for (let i = 1; i < predLineUSD.length; i++) {
        if (predLineUSD[i].x >= tsMs) {
            const a = predLineUSD[i - 1], b = predLineUSD[i];
            const t = (tsMs - a.x) / (b.x - a.x);
            return Math.exp(Math.log(a.y) + t * (Math.log(b.y) - Math.log(a.y)));
        }
    }
    return predLineUSD[predLineUSD.length - 1].y;
}
