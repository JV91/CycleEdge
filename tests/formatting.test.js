// tests/formatting.test.js
// Loads the real js/formatting.js via vm and tests its functions.
//
// Note: fmtPrice, fmtDate, fmtSI are defined with `const` in the source, so they
// are NOT exposed as properties on the vm context object. We use the `call` helper
// (which runs the expression inside the vm) to invoke them.

import { makeContext, load, call } from './helpers.js';

// Helper: create a context with the given currency symbol and load formatting.js
function mkCtx(sym) {
    return load(makeContext({ currencySymbol: sym }), 'formatting.js');
}

const usd = mkCtx('$');

// ── fmtPrice tests ────────────────────────────────────────────────────────────

describe('fmtPrice with $ symbol', () => {
    it('formats zero as $0', () => {
        expect(call(usd, 'fmtPrice', 0)).toBe('$0');
    });

    it('formats a sub-1 value by rounding to 0', () => {
        expect(call(usd, 'fmtPrice', 0.7)).toBe('$1'); // Math.round(0.7)=1
    });

    it('formats value under 1000 without comma', () => {
        expect(call(usd, 'fmtPrice', 999)).toBe('$999');
    });

    it('formats value in thousands with locale number separator', () => {
        expect(call(usd, 'fmtPrice', 12345)).toBe('$' + Math.round(12345).toLocaleString('en-US'));
    });

    it('formats large value (BTC-level price) correctly', () => {
        expect(call(usd, 'fmtPrice', 69000)).toBe('$' + Math.round(69000).toLocaleString('en-US'));
    });

    it('rounds fractional value before formatting', () => {
        expect(call(usd, 'fmtPrice', 1234.6)).toBe('$' + Math.round(1234.6).toLocaleString('en-US'));
    });

    it('works with a non-$ symbol prefix', () => {
        const c = mkCtx('CHF\u00a0');
        expect(call(c, 'fmtPrice', 1000)).toBe('CHF\u00a0' + Math.round(1000).toLocaleString('en-US'));
    });
});

// ── fmtDate tests ─────────────────────────────────────────────────────────────

describe('fmtDate', () => {
    it('produces a readable date string for a known timestamp', () => {
        const ts = new Date('2024-04-19').getTime();
        const result = call(usd, 'fmtDate', ts);
        expect(result).toContain('2024');
        expect(result).toContain('Apr');
        expect(result).toContain('19');
    });

    it('handles Jan 1 correctly', () => {
        const ts = new Date('2020-01-01').getTime();
        const result = call(usd, 'fmtDate', ts);
        expect(result).toContain('Jan');
        expect(result).toContain('1');
        expect(result).toContain('2020');
    });

    it('handles Dec 31 correctly', () => {
        const ts = new Date('2023-12-31').getTime();
        const result = call(usd, 'fmtDate', ts);
        expect(result).toContain('Dec');
        expect(result).toContain('31');
        expect(result).toContain('2023');
    });

    it('returns a string', () => {
        expect(typeof call(usd, 'fmtDate', new Date('2024-06-01').getTime())).toBe('string');
    });
});

// ── fmtSI tests ───────────────────────────────────────────────────────────────

describe('fmtSI', () => {
    it('returns — for null', () => {
        expect(call(usd, 'fmtSI', null)).toBe('—');
    });

    it('returns — for Infinity', () => {
        expect(call(usd, 'fmtSI', Infinity)).toBe('—');
    });

    it('returns — for NaN', () => {
        expect(call(usd, 'fmtSI', NaN)).toBe('—');
    });

    it('formats millions with M suffix and 2 decimal places', () => {
        expect(call(usd, 'fmtSI', 1_000_000)).toBe('$1.00M');
        expect(call(usd, 'fmtSI', 2_500_000)).toBe('$2.50M');
    });

    it('formats thousands with locale number separator (no M suffix)', () => {
        expect(call(usd, 'fmtSI', 5000)).toBe('$' + Math.round(5000).toLocaleString());
        expect(call(usd, 'fmtSI', 999_999)).toBe('$' + Math.round(999_999).toLocaleString());
    });

    it('formats small values (< 1000) without comma', () => {
        expect(call(usd, 'fmtSI', 500)).toBe('$500');
        expect(call(usd, 'fmtSI', 0)).toBe('$0');
    });

    it('uses the provided currency symbol', () => {
        const cCHF = mkCtx('CHF\u00a0');
        const cCZK = mkCtx('Kč\u00a0');
        expect(call(cCHF, 'fmtSI', 1_500_000)).toBe('CHF\u00a01.50M');
        expect(call(cCZK, 'fmtSI', 50000)).toBe('Kč\u00a0' + Math.round(50000).toLocaleString());
    });

    it('rounds thousands correctly', () => {
        expect(call(usd, 'fmtSI', 1234.6)).toBe('$' + Math.round(1234.6).toLocaleString());
    });

    it('boundary: exactly 1,000,000 goes into M branch', () => {
        expect(call(usd, 'fmtSI', 1e6)).toBe('$1.00M');
    });

    it('boundary: 999,999 stays in thousands branch', () => {
        expect(call(usd, 'fmtSI', 999_999)).not.toContain('M');
    });
});
