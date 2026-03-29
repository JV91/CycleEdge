// tests/indicators.test.js
// Loads the real js/indicators.js via vm and tests its exported functions.

import { makeContext, load } from './helpers.js';

const ctx = load(makeContext(), 'indicators.js');
const { rollingMean, computeZScore, buildSignals } = ctx;

// ── rollingMean tests ─────────────────────────────────────────────────────────

describe('rollingMean', () => {
    it('fills first (n-1) values with null', () => {
        const result = rollingMean([1, 2, 3, 4, 5], 3);
        expect(result[0]).toBeNull();
        expect(result[1]).toBeNull();
    });

    it('produces correct mean at the first valid index', () => {
        const result = rollingMean([1, 2, 3, 4, 5], 3);
        expect(result[2]).toBeCloseTo(2); // (1+2+3)/3
    });

    it('slides correctly — uses only last n values', () => {
        const result = rollingMean([1, 2, 3, 4, 5], 3);
        expect(result[3]).toBeCloseTo(3); // (2+3+4)/3
        expect(result[4]).toBeCloseTo(4); // (3+4+5)/3
    });

    it('window of 1 returns the value itself', () => {
        const arr = [10, 20, 30];
        const result = rollingMean(arr, 1);
        expect(result).toEqual([10, 20, 30]);
    });

    it('returns all nulls when window exceeds array length', () => {
        const result = rollingMean([1, 2], 5);
        expect(result.every(v => v === null)).toBe(true);
    });

    it('returns empty array for empty input', () => {
        expect(rollingMean([], 3)).toEqual([]);
    });

    it('window equal to array length yields one valid value at last index', () => {
        const result = rollingMean([2, 4, 6], 3);
        expect(result[0]).toBeNull();
        expect(result[1]).toBeNull();
        expect(result[2]).toBeCloseTo(4); // (2+4+6)/3
    });
});

// ── computeZScore tests ───────────────────────────────────────────────────────

describe('computeZScore', () => {
    it('returns null for the first (win-1) values', () => {
        const prices = Array.from({ length: 10 }, (_, i) => 100 + i);
        const z = computeZScore(prices, 5);
        for (let i = 0; i < 4; i++) expect(z[i]).toBeNull();
    });

    it('first valid index is win-1', () => {
        const prices = Array.from({ length: 10 }, (_, i) => 100 + i * 5);
        const z = computeZScore(prices, 5);
        expect(z[4]).not.toBeNull();
    });

    it('z-score is 0 when all values are equal (std=0)', () => {
        const prices = new Array(10).fill(100);
        const z = computeZScore(prices, 5);
        for (let i = 4; i < 10; i++) expect(z[i]).toBe(0);
    });

    it('produces a positive z-score when last value is well above mean', () => {
        // Linear ramp then spike
        const prices = [100, 100, 100, 100, 200]; // last value is far above mean
        const z = computeZScore(prices, 5);
        expect(z[4]).toBeGreaterThan(0);
    });

    it('produces a negative z-score when last value is well below mean', () => {
        const prices = [100, 100, 100, 100, 10]; // last value is far below mean
        const z = computeZScore(prices, 5);
        expect(z[4]).toBeLessThan(0);
    });

    it('known value: linearly spaced array [1,2,3,4,5] win=5 — last z is 0 (mean=3, price=5, std known)', () => {
        const prices = [1, 2, 3, 4, 5];
        const z = computeZScore(prices, 5);
        // mean=3, std=sqrt(2), z=(5-3)/sqrt(2) ≈ 1.414
        expect(z[4]).toBeCloseTo(Math.SQRT2, 3);
    });
});

// ── buildSignals tests ────────────────────────────────────────────────────────

describe('buildSignals', () => {
    it('returns null for indices where either z or zSma is null', () => {
        const z    = [null, null, 1, 1];
        const zSma = [null, null, 0, 0];
        const sig  = buildSignals(z, zSma, 0, 0);
        expect(sig[0]).toBeNull();
        expect(sig[1]).toBeNull();
    });

    it('generates buy when z > zSma + entryBuf', () => {
        // z=2, zSma=1, entryBuf=0 → 2 > 1 → buy
        const z    = [null, null, 2, 2];
        const zSma = [null, null, 1, 1];
        const sig  = buildSignals(z, zSma, 0, 0);
        expect(sig[2]).toBe('buy');
        expect(sig[3]).toBe('buy');
    });

    it('does NOT generate buy when z <= zSma + entryBuf (entry buffer blocks)', () => {
        // z=1.1, zSma=1, entryBuf=0.5 → 1.1 < 1.5 → stay sell
        const z    = [null, null, 1.1, 1.1];
        const zSma = [null, null, 1.0, 1.0];
        const sig  = buildSignals(z, zSma, 0.5, 0);
        expect(sig[2]).toBe('sell');
    });

    it('generates sell when z < zSma - exitBuf after being in buy', () => {
        // First cross up to buy, then cross below to sell
        const z    = [null, 2, 0.5, 0.5];
        const zSma = [null, 1, 1.0, 1.0];
        // entryBuf=0, exitBuf=0 → sell when z < zSma
        const sig  = buildSignals(z, zSma, 0, 0);
        expect(sig[1]).toBe('buy');
        expect(sig[2]).toBe('sell');
    });

    it('exit buffer prevents sell when z only barely crosses below zSma', () => {
        // z crosses below zSma by 0.1 but exitBuf=0.5 → stay buy
        const z    = [null, 2, 0.9, 0.9];
        const zSma = [null, 1, 1.0, 1.0];
        const sig  = buildSignals(z, zSma, 0, 0.5);
        expect(sig[1]).toBe('buy');
        expect(sig[2]).toBe('buy'); // z=0.9, zSma-exitBuf=0.5, 0.9 > 0.5 → still buy
    });

    it('signal persists once set (hysteresis)', () => {
        // After a buy, signal stays buy even when z == zSma (no exit condition met)
        const z    = [null, 2, 1, 1, 0.6];
        const zSma = [null, 1, 1, 1, 1.0];
        const sig  = buildSignals(z, zSma, 0, 0);
        expect(sig[1]).toBe('buy');  // 2 > 1
        expect(sig[2]).toBe('buy');  // z==zSma → NOT < zSma → stays buy
        expect(sig[3]).toBe('buy');  // same
        expect(sig[4]).toBe('sell'); // z=0.6 < zSma=1 → sell
    });

    it('starts in sell state by default (no buy before first cross)', () => {
        const z    = [null, -1, -2];
        const zSma = [null,  0,  0];
        const sig  = buildSignals(z, zSma, 0, 0);
        expect(sig[1]).toBe('sell');
        expect(sig[2]).toBe('sell');
    });
});
