// ── Rolling maths (O(n) sliding window) ──────────────────────────────────────

function rollingMean(arr, n) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
        if (i >= n) sum -= arr[i - n];
        if (i >= n - 1) out[i] = sum / n;
    }
    return out;
}

function rollingStd(arr, n) {
    const out = new Array(arr.length).fill(null);
    let sx = 0, sx2 = 0;
    for (let i = 0; i < arr.length; i++) {
        sx  += arr[i];
        sx2 += arr[i] * arr[i];
        if (i >= n) { sx -= arr[i - n]; sx2 -= arr[i - n] * arr[i - n]; }
        if (i >= n - 1) {
            const mean = sx / n;
            out[i] = Math.sqrt(Math.max(0, sx2 / n - mean * mean));
        }
    }
    return out;
}

// ── Signal computation (hysteresis) ──────────────────────────────────────────

function computeSignals(prices, zWin, smaWin, entryBuf, exitBuf) {
    const n = prices.length;
    const ma  = rollingMean(prices, zWin);
    const std = rollingStd(prices, zWin);

    const zArr = new Array(n).fill(null);
    for (let i = zWin - 1; i < n; i++)
        zArr[i] = std[i] > 0 ? (prices[i] - ma[i]) / std[i] : 0;

    const zSma = new Array(n).fill(null);
    let sum = 0, cnt = 0;
    for (let i = zWin - 1; i < n; i++) {
        sum += zArr[i]; cnt++;
        if (cnt > smaWin) sum -= zArr[i - smaWin];
        if (cnt >= smaWin) zSma[i] = sum / smaWin;
    }

    const signals = new Array(n).fill(null);
    let state = 'sell';
    for (let i = 0; i < n; i++) {
        if (zArr[i] === null || zSma[i] === null) continue;
        if      (state === 'sell' && zArr[i] > zSma[i] + entryBuf) state = 'buy';
        else if (state === 'buy'  && zArr[i] < zSma[i] - exitBuf)  state = 'sell';
        signals[i] = state;
    }
    return { zArr, zSma, signals };
}

// Expose computeZScore and buildSignals as standalone functions for testability
// (computeSignals above is the combined version used by the app)

function computeZScore(prices, win) {
    const n = prices.length;
    const ma  = rollingMean(prices, win);
    const std = rollingStd(prices, win);
    const zArr = new Array(n).fill(null);
    for (let i = win - 1; i < n; i++)
        zArr[i] = std[i] > 0 ? (prices[i] - ma[i]) / std[i] : 0;
    return zArr;
}

function buildSignals(zArr, zSma, entryBuf, exitBuf) {
    const n = zArr.length;
    const signals = new Array(n).fill(null);
    let state = 'sell';
    for (let i = 0; i < n; i++) {
        if (zArr[i] === null || zSma[i] === null) continue;
        if      (state === 'sell' && zArr[i] > zSma[i] + entryBuf) state = 'buy';
        else if (state === 'buy'  && zArr[i] < zSma[i] - exitBuf)  state = 'sell';
        signals[i] = state;
    }
    return signals;
}
