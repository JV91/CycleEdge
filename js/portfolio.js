// ── Portfolio simulation ──────────────────────────────────────────────────────

function buildPortfolioValues(prices, signals, lev = 1) {
    const firstValid = signals.findIndex(s => s !== null);
    if (firstValid < 0) return new Array(prices.length).fill(null);

    const values = new Array(prices.length).fill(null);
    let locked = 1.0, entry = null;

    for (let i = firstValid; i < prices.length; i++) {
        const s = signals[i], prev = signals[i - 1] ?? null;
        if (s === 'buy') {
            if (prev !== 'buy') entry = prices[i];
            const ratio = Math.max(0, 1 + lev * (prices[i] / entry - 1)); // leveraged, capped at 0
            values[i] = locked * ratio;
        } else {
            if (prev === 'buy' && entry !== null) {
                locked *= Math.max(0, 1 + lev * (prices[i] / entry - 1));
                entry = null;
            }
            values[i] = locked;
        }
    }
    return values;
}

function computeYearlyReturns(dates, portfolioValues, prices) {
    const byYear = {};
    for (let i = 0; i < dates.length; i++) {
        if (portfolioValues[i] === null) continue;
        const yr = new Date(dates[i]).getFullYear();
        if (!byYear[yr]) byYear[yr] = { first: i };
        byYear[yr].last = i;
    }
    return Object.entries(byYear)
        .sort(([a], [b]) => +a - +b)
        .map(([yr, { first, last }]) => ({
            year: +yr,
            strat: +((portfolioValues[last] / portfolioValues[first] - 1) * 100).toFixed(1),
            bh:    +((prices[last]          / prices[first]          - 1) * 100).toFixed(1)
        }));
}
