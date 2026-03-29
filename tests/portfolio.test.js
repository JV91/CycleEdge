// tests/portfolio.test.js
// Loads the real js/portfolio.js via vm and tests its exported functions.

import { makeContext, load } from './helpers.js';

const ctx = load(makeContext(), 'portfolio.js');
const { buildPortfolioValues, computeYearlyReturns } = ctx;

// ── buildPortfolioValues tests ────────────────────────────────────────────────

describe('buildPortfolioValues', () => {
    it('returns all nulls when no signals (all null)', () => {
        const prices  = [100, 200, 300];
        const signals = [null, null, null];
        const result  = buildPortfolioValues(prices, signals);
        expect(result.every(v => v === null)).toBe(true);
    });

    it('values before firstValid are null', () => {
        const prices  = [100, 100, 200, 200];
        const signals = [null, null, 'sell', 'sell'];
        const result  = buildPortfolioValues(prices, signals);
        expect(result[0]).toBeNull();
        expect(result[1]).toBeNull();
        expect(result[2]).not.toBeNull();
    });

    it('1x leverage: held cash during sell keeps value flat', () => {
        const prices  = [100, 150, 200];
        const signals = [null, 'sell', 'sell'];
        const result  = buildPortfolioValues(prices, signals, 1);
        expect(result[1]).toBe(1.0);
        expect(result[2]).toBe(1.0);
    });

    it('1x leverage: price doubles during buy → portfolio doubles', () => {
        // null, null, buy@100, buy@200 — price 2×
        const prices  = [50, 100, 100, 200];
        const signals = [null, null, 'buy', 'buy'];
        const result  = buildPortfolioValues(prices, signals, 1);
        // Entry at 100, current 200 → ratio = 1 + 1*(200/100-1) = 2
        expect(result[2]).toBeCloseTo(1.0); // entry point: locked=1, ratio=1
        expect(result[3]).toBeCloseTo(2.0);
    });

    it('1x leverage: sell after buy locks in the gain', () => {
        // buy@100, sell@200 → locked becomes 2.0; then stays 2.0 in cash
        const prices  = [100, 200, 200];
        const signals = ['buy', 'buy', 'sell'];
        const result  = buildPortfolioValues(prices, signals, 1);
        expect(result[1]).toBeCloseTo(2.0);
        expect(result[2]).toBeCloseTo(2.0); // locked = 2.0, no buy
    });

    it('1.5x leverage: price doubles → 1 + 1.5*(2-1) = 2.5', () => {
        const prices  = [100, 200];
        const signals = ['buy', 'buy'];
        const result  = buildPortfolioValues(prices, signals, 1.5);
        expect(result[0]).toBeCloseTo(1.0);
        expect(result[1]).toBeCloseTo(2.5);
    });

    it('2x leverage: price drops 50% → liquidation (value = 0)', () => {
        const prices  = [100, 50];
        const signals = ['buy', 'buy'];
        const result  = buildPortfolioValues(prices, signals, 2);
        // 1 + 2*(50/100 - 1) = 1 + 2*(-0.5) = 0
        expect(result[1]).toBeCloseTo(0);
    });

    it('2x leverage: value clamps to 0 (never negative)', () => {
        const prices  = [100, 30]; // drop of 70%
        const signals = ['buy', 'buy'];
        const result  = buildPortfolioValues(prices, signals, 2);
        // 1 + 2*(0.3 - 1) = 1 - 1.4 = -0.4 → clamped to 0
        expect(result[1]).toBe(0);
    });

    it('locked value carries between buy periods', () => {
        // Period 1: buy@100→200 (2×), Period 2 (sell), Period 3: buy@200→400 (2× again → total 4×)
        const prices  = [100, 200, 200, 200, 400];
        const signals = ['buy', 'buy', 'sell', 'buy', 'buy'];
        const result  = buildPortfolioValues(prices, signals, 1);
        // After first buy period: locked = 2.0
        expect(result[2]).toBeCloseTo(2.0); // sell at 200, locked = 2
        // Second buy period: entry=200, price goes to 400 → ratio=2 → value = 2*2 = 4
        expect(result[4]).toBeCloseTo(4.0);
    });

    it('no buy signals at all → value stays at 1.0 throughout sell', () => {
        const prices  = [100, 200, 300];
        const signals = ['sell', 'sell', 'sell'];
        const result  = buildPortfolioValues(prices, signals, 1);
        expect(result[0]).toBe(1.0);
        expect(result[1]).toBe(1.0);
        expect(result[2]).toBe(1.0);
    });
});

// ── computeYearlyReturns tests ────────────────────────────────────────────────

describe('computeYearlyReturns', () => {
    it('groups by year correctly (two years)', () => {
        // 3 dates: Dec 31 year1, Jan 1 year2, Dec 31 year2
        const y1start = new Date('2020-01-01').getTime();
        const y1end   = new Date('2020-12-31').getTime();
        const y2end   = new Date('2021-12-31').getTime();
        const dates   = [y1start, y1end, y2end];
        const pv      = [1.0, 2.0, 4.0];
        const prices  = [100, 200, 400];
        const result  = computeYearlyReturns(dates, pv, prices);
        expect(result).toHaveLength(2);
        expect(result[0].year).toBe(2020);
        expect(result[1].year).toBe(2021);
    });

    it('strategy return is calculated correctly within year', () => {
        const y1start = new Date('2020-01-01').getTime();
        const y1end   = new Date('2020-12-31').getTime();
        const dates   = [y1start, y1end];
        const pv      = [1.0, 3.0]; // 200% gain
        const prices  = [100, 200]; // 100% gain
        const result  = computeYearlyReturns(dates, pv, prices);
        expect(result[0].strat).toBeCloseTo(200.0, 0);
        expect(result[0].bh).toBeCloseTo(100.0, 0);
    });

    it('skips null portfolio values', () => {
        const dates  = [new Date('2020-06-01').getTime(), new Date('2020-12-31').getTime()];
        const pv     = [null, 2.0];
        const prices = [100, 200];
        const result = computeYearlyReturns(dates, pv, prices);
        // Only one valid date so first === last → strat = 0
        expect(result[0].strat).toBe(0);
    });

    it('sorts years in ascending order', () => {
        const dates = [
            new Date('2022-01-01').getTime(),
            new Date('2021-01-01').getTime(),
            new Date('2020-01-01').getTime(),
        ];
        const pv     = [1, 1, 1];
        const prices = [100, 100, 100];
        const result = computeYearlyReturns(dates, pv, prices);
        expect(result[0].year).toBeLessThan(result[1].year);
        expect(result[1].year).toBeLessThan(result[2].year);
    });
});
