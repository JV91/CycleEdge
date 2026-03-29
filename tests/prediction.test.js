// tests/prediction.test.js
// Loads the real js/prediction.js via vm and tests its exported functions.

import { makeContext, load } from './helpers.js';

// ── Test data setup ───────────────────────────────────────────────────────────
// The cycle-repeat algorithm needs real historical data spanning the 2020 cycle
// so it can propagate weekly price ratios forward.
// We generate a synthetic daily price series from 2020-01-01 to tNow.

const DAY  = 86400000;
const WEEK = 7 * DAY;

function makePriceHistory(endDate = new Date('2026-01-01')) {
    const start = new Date('2020-01-01').getTime();
    const end   = endDate.getTime();
    const testDates  = [];
    const testPrices = [];
    for (let t = start; t <= end; t += DAY) {
        testDates.push(t);
        // Synthetic BTC-like price: oscillating between 15000 and 85000
        const progress = (t - start) / (end - start);
        const p = 15000 + 70000 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 6));
        testPrices.push(Math.round(p));
    }
    return { testDates, testPrices };
}

const tNow = new Date('2026-01-01').getTime();
const { testDates, testPrices } = makePriceHistory(new Date('2026-01-01'));
const pNow = testPrices[testPrices.length - 1];

function makeCtx() {
    return load(makeContext({
        dates: testDates,
        pricesUSD: testPrices,
        predLineUSD: null,
    }), 'prediction.js');
}

// ── generatePredictionLine tests ──────────────────────────────────────────────
describe('generatePredictionLine', () => {
    let pts;
    beforeEach(() => {
        pts = makeCtx().generatePredictionLine(201521, 27800);
    });

    it('starts at the current price', () => {
        expect(pts[0].y).toBe(pNow);
    });

    it('x values start from tNow', () => {
        expect(pts[0].x).toBe(tNow);
    });

    it('produces weekly points (spacing = 7 days)', () => {
        for (let i = 1; i < Math.min(pts.length, 10); i++) {
            expect(pts[i].x - pts[i - 1].x).toBe(WEEK);
        }
    });

    it('extends well past 2028 (covers next bull run)', () => {
        const tHalving2028 = new Date('2028-04-18').getTime();
        const lastX = pts[pts.length - 1].x;
        expect(lastX).toBeGreaterThan(tHalving2028);
    });

    it('all price values are positive integers', () => {
        for (const p of pts) {
            expect(Number.isInteger(p.y)).toBe(true);
            expect(p.y).toBeGreaterThan(0);
        }
    });

    it('has no NaN in any point', () => {
        for (const p of pts) {
            expect(isNaN(p.y)).toBe(false);
            expect(isNaN(p.x)).toBe(false);
        }
    });

    it('has a bear phase that dips below current price', () => {
        const bearPts = pts.filter(p => p.y < pNow);
        expect(bearPts.length).toBeGreaterThan(0);
    });

    it('minimum of bear phase is close to projectedBottomUSD (within 5%)', () => {
        const projBottom = 27800;
        const bearMin = Math.min(...pts.filter(p => p.y < pNow).map(p => p.y));
        expect(bearMin).toBeGreaterThan(projBottom * 0.95);
        expect(bearMin).toBeLessThan(projBottom * 1.05);
    });

    it('different projectedBottomUSD produces different bear-phase minimum', () => {
        const ctx = makeCtx();
        const pts1 = ctx.generatePredictionLine(201521, 27800);
        const pts2 = ctx.generatePredictionLine(201521, 40000);
        const min1 = Math.min(...pts1.filter(p => p.y < pNow).map(p => p.y));
        const min2 = Math.min(...pts2.filter(p => p.y < pNow).map(p => p.y));
        expect(min2).toBeGreaterThan(min1);
    });

    it('has a recovery phase where prices climb above pNow again', () => {
        const recoveryPts = pts.filter(p => p.x > new Date('2027-01-01').getTime() && p.y > pNow);
        expect(recoveryPts.length).toBeGreaterThan(0);
    });

    it('returns at least 50 data points', () => {
        expect(pts.length).toBeGreaterThan(50);
    });
});

// ── siGetPredPriceUSD tests ───────────────────────────────────────────────────

describe('siGetPredPriceUSD', () => {
    const t0 = new Date('2026-01-01').getTime();
    const t1 = new Date('2027-01-01').getTime();
    const predLine = [
        { x: t0, y: 80000 },
        { x: t1, y: 40000 },
    ];

    function makeCtxWithPred() {
        return load(makeContext({
            predLineUSD: predLine,
            dates: [t0],
            pricesUSD: [80000],
        }), 'prediction.js');
    }

    it('returns null when predLineUSD is null', () => {
        const c = load(makeContext({ predLineUSD: null, dates: [t0], pricesUSD: [80000] }), 'prediction.js');
        expect(c.siGetPredPriceUSD(t0)).toBeNull();
    });

    it('clamps to first point when ts is before range', () => {
        const c = makeCtxWithPred();
        expect(c.siGetPredPriceUSD(t0 - 1000)).toBe(80000);
    });

    it('clamps to last point when ts is after range', () => {
        const c = makeCtxWithPred();
        expect(c.siGetPredPriceUSD(t1 + 1000)).toBe(40000);
    });

    it('returns exact start value at t0', () => {
        const c = makeCtxWithPred();
        expect(c.siGetPredPriceUSD(t0)).toBe(80000);
    });

    it('interpolates on log scale between two points', () => {
        const c = makeCtxWithPred();
        const tMid = (t0 + t1) / 2;
        const expected = Math.exp((Math.log(80000) + Math.log(40000)) / 2);
        expect(c.siGetPredPriceUSD(tMid)).toBeCloseTo(expected, 0);
    });
});
