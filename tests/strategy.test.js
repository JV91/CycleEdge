// tests/strategy.test.js
// Loads real js/constants.js, js/prediction.js, js/strategy.js via vm.

import { makeContext, load } from './helpers.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

// Build a realistic predLineUSD: declines from $85k in Mar 2026 to $38k in Oct 2026,
// then recovers through halving (~$85k Apr 2028) and peaks at $200k Oct 2029.
function buildPredLine() {
    const pts = [];
    const milestones = [
        { t: new Date('2026-03-01').getTime(), p: 85000 },
        { t: new Date('2026-10-17').getTime(), p: 38000 },
        { t: new Date('2028-04-18').getTime(), p: 85000 },
        { t: new Date('2029-10-05').getTime(), p: 200000 },
        { t: new Date('2031-01-01').getTime(), p: 65000 },
    ];
    const step = 7 * 86400000;
    const tStart = milestones[0].t;
    const tEnd   = milestones[milestones.length - 1].t;
    for (let t = tStart; t <= tEnd; t += step) {
        // Find surrounding milestones
        let i = 1;
        while (i < milestones.length - 1 && milestones[i].t < t) i++;
        const a = milestones[i - 1], b = milestones[i];
        const frac = (t - a.t) / (b.t - a.t);
        const p = Math.exp(Math.log(a.p) + frac * (Math.log(b.p) - Math.log(a.p)));
        pts.push({ x: t, y: Math.round(p) });
    }
    return pts;
}

const predLineUSD = buildPredLine();

// DOM input values used across most tests
const DEFAULT_INPUTS = {
    siLumpSum:      '40000',
    siMonthly:      '8000',
    siStartDate:    '2026-04',
    siStopOffset:   '6',
    siT1Price:      '65000',
    siT1Backstop:   '2026-10',
    siT2Price:      '50000',
    siT2Backstop:   '2026-11',
    siT3Price:      '40000',
    siT3Backstop:   '2026-12',
    allocBTCDirect: '80',
    allocBTCLev:    '10',
    allocMSTR:      '10',
    btcLevMult:     '2',
    mstrLevMult:    '1.8',
    allocWarn:      '',
};

function makeStratCtx(inputValues = DEFAULT_INPUTS, extraGlobals = {}) {
    const ctx = makeContext({
        predLineUSD,
        dates:     [new Date('2026-03-01').getTime()],
        pricesUSD: [85000],
        currencyRate: 1,
        ...extraGlobals,
    });
    ctx.document = {
        getElementById: id => ({
            value:            inputValues[id] ?? '0',
            textContent:      '',
            addEventListener: () => {},
            style:            { display: '' },
        }),
    };
    return load(ctx, 'constants.js', 'prediction.js', 'strategy.js');
}

// Convenience: run siBuildPlan with default inputs
function buildPlan(inputOverrides = {}) {
    const ctx = makeStratCtx({ ...DEFAULT_INPUTS, ...inputOverrides });
    return ctx.siBuildPlan();
}

// ── siAddMonths tests ─────────────────────────────────────────────────────────

describe('siAddMonths', () => {
    const ctx = makeStratCtx();

    it('adds months correctly across year boundary', () => {
        const ts = new Date('2026-10-01').getTime();
        const result = ctx.siAddMonths(ts, 3);
        const d = new Date(result);
        expect(d.getFullYear()).toBe(2027);
        expect(d.getMonth()).toBe(0); // January
    });

    it('handles negative months (subtracting)', () => {
        const ts = new Date('2027-03-01').getTime();
        const result = ctx.siAddMonths(ts, -3);
        const d = new Date(result);
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(11); // December
    });

    it('adding 0 months returns same timestamp', () => {
        const ts = new Date('2026-06-15').getTime();
        expect(ctx.siAddMonths(ts, 0)).toBe(ts);
    });
});

// ── siBuildPlan — basic sanity ────────────────────────────────────────────────

describe('siBuildPlan — basic sanity', () => {
    it('returns a non-null plan object', () => {
        expect(buildPlan()).not.toBeNull();
    });

    it('plan has chartPts, rows, totalInvested, btcDirectHeld', () => {
        const plan = buildPlan();
        expect(plan).toHaveProperty('chartPts');
        expect(plan).toHaveProperty('rows');
        expect(plan).toHaveProperty('totalInvested');
        expect(plan).toHaveProperty('btcDirectHeld');
    });

    it('returns null when siStartDate is empty', () => {
        const plan = buildPlan({ siStartDate: '' });
        expect(plan).toBeNull();
    });

    it('chartPts contains holdingsOnly series (Bug Fix 2)', () => {
        const plan = buildPlan();
        expect(plan.chartPts).toHaveProperty('holdingsOnly');
        expect(plan.chartPts.holdingsOnly.length).toBeGreaterThan(0);
    });

    it('holdingsOnly excludes exitProceeds (less than or equal to total)', () => {
        const plan = buildPlan();
        const { holdingsOnly, total } = plan.chartPts;
        // After exits fire, total includes exitProceeds but holdingsOnly does not
        for (let i = 0; i < total.length; i++) {
            expect(holdingsOnly[i].y).toBeLessThanOrEqual(total[i].y + 1); // +1 rounding
        }
    });
});

// ── siBuildPlan — lump sum triggers ──────────────────────────────────────────

describe('siBuildPlan — lump sum triggers', () => {
    it('T1 fires when predicted price drops at or below target ($65k)', () => {
        // With default inputs, T1 target is $65k. The pred line starts at $85k and
        // falls below $65k before the backstop of 2026-10, so T1 should fire.
        const plan = buildPlan();
        expect(plan.lumpTranches[0].fired).toBe(true);
    });

    it('total invested is positive after plan runs', () => {
        const plan = buildPlan();
        expect(plan.totalInvested).toBeGreaterThan(0);
    });

    it('all lump tranches fire when backstops are very early', () => {
        // Set all backstops to the start month — they should all fire on first month
        const plan = buildPlan({
            siT1Backstop: '2026-04',
            siT2Backstop: '2026-04',
            siT3Backstop: '2026-04',
        });
        expect(plan.lumpTranches[0].fired).toBe(true);
        expect(plan.lumpTranches[1].fired).toBe(true);
        expect(plan.lumpTranches[2].fired).toBe(true);
    });

    it('lump tranches do not fire when price targets are below pred line range and backstops are far future', () => {
        // The pred line stays above $1 throughout — targets of '$1' (1 USD) won't be
        // reached since priceUSD <= 1 is never true. Backstops are past tEnd so they
        // also won't trigger. Result: no tranches fire.
        const plan = buildPlan({
            siT1Price: '1', siT1Backstop: '2035-01',
            siT2Price: '1', siT2Backstop: '2035-01',
            siT3Price: '1', siT3Backstop: '2035-01',
        });
        expect(plan.lumpTranches[0].fired).toBe(false);
        expect(plan.lumpTranches[1].fired).toBe(false);
        expect(plan.lumpTranches[2].fired).toBe(false);
    });
});

// ── siBuildPlan — exit tiers ──────────────────────────────────────────────────

// Build a pred line that sustains above $200k for several months around the top
// so that a monthly iteration (which lands on the 1st of each month) will
// interpolate to >= $200k and trigger Tier 3.
function buildPredLineWithHighTop() {
    const topTs = new Date('2029-10-05').getTime();
    const line = buildPredLine().filter(p => p.x < topTs - 60 * 86400000);
    // Plateau at $210k for ~3 months so monthly ticks hit it
    line.push({ x: topTs - 60 * 86400000, y: 210000 });
    line.push({ x: topTs,                  y: 210000 });
    line.push({ x: topTs + 60 * 86400000,  y: 210000 });
    line.push({ x: topTs + 90 * 86400000,  y: 150000 });
    return line;
}

describe('siBuildPlan — exit tiers', () => {
    it('at least 2 exit tiers fire when pred line reaches ~$199k', () => {
        // Default pred line peaks at ~$199k (just below $200k Tier 3 threshold),
        // so Tier 1 ($130k) and Tier 2 ($170k) fire; Tier 3 ($200k) may not.
        const plan = buildPlan();
        const sellNotes = plan.rows.map(r => r.note).filter(n => n && n.includes('sell'));
        expect(sellNotes.length).toBeGreaterThanOrEqual(2);
    });

    it('all 3 exit tiers fire when pred line sustains above $200k', () => {
        const ctx = makeStratCtx(DEFAULT_INPUTS, { predLineUSD: buildPredLineWithHighTop() });
        const plan = ctx.siBuildPlan();
        const sellNotes = plan.rows.map(r => r.note).filter(n => n && n.includes('sell'));
        expect(sellNotes.length).toBeGreaterThanOrEqual(3);
    });

    it('peakTotal is greater than totalInvested', () => {
        const plan = buildPlan();
        expect(plan.peakTotal).toBeGreaterThan(plan.totalInvested);
    });
});

// ── siBuildPlan — allocation warning ─────────────────────────────────────────

// Build a fresh context with a DOM spy so we can capture the allocWarn textContent.
// We cannot reuse makeStratCtx here and then reload, as constants.js uses const
// declarations that would clash on a second load into the same context.
function makeWarnCtx(inputValues) {
    let warnText = '';
    const ctx = makeContext({
        predLineUSD,
        dates:     [new Date('2026-03-01').getTime()],
        pricesUSD: [85000],
        currencyRate: 1,
    });
    ctx.document = {
        getElementById: id => ({
            value: inputValues[id] ?? '0',
            get textContent() { return warnText; },
            set textContent(v) { if (id === 'allocWarn') warnText = v; },
            addEventListener: () => {},
            style: { display: '' },
        }),
    };
    load(ctx, 'constants.js', 'prediction.js', 'strategy.js');
    return { ctx, getWarn: () => warnText };
}

describe('siBuildPlan — allocation warning', () => {
    it('no allocWarn when allocations sum to 100', () => {
        const { ctx, getWarn } = makeWarnCtx({ ...DEFAULT_INPUTS, allocBTCDirect: '80', allocBTCLev: '10', allocMSTR: '10' });
        ctx.siBuildPlan();
        expect(getWarn()).toBe('');
    });

    it('allocWarn contains sum% when allocations do not sum to 100', () => {
        const inputs = { ...DEFAULT_INPUTS, allocBTCDirect: '80', allocBTCLev: '10', allocMSTR: '5' }; // sum=95
        const { ctx, getWarn } = makeWarnCtx(inputs);
        ctx.siBuildPlan();
        expect(getWarn()).toContain('95%');
        expect(getWarn()).toContain('100%');
    });
});

// ── siBuildPlan — last monthly buy note (Bug Fix 3) ───────────────────────────

describe('siBuildPlan — last monthly buy note', () => {
    it('marks the last monthly buy month with "Last monthly buy" note', () => {
        const plan = buildPlan();
        // tStop = SI_PRED_TOP.ts - 6 months. The last month with monthlyThis > 0
        // is the month where siAddMonths(t, 1) > tStop. That row should have the note.
        const lastMonthlyRow = plan.rows
            .filter(r => r.note === 'Last monthly buy')
            .pop();
        expect(lastMonthlyRow).toBeDefined();
    });

    it('only one row carries the "Last monthly buy" note', () => {
        const plan = buildPlan();
        const count = plan.rows.filter(r => r.note === 'Last monthly buy').length;
        expect(count).toBe(1);
    });
});
