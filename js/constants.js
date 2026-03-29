// ── Cycle reference data ──────────────────────────────────────────────────────

const CYCLE_TOPS = [
    { x: new Date('2013-11-29').getTime(), y: 1150,   _yUSD: 1150,   daysFromHalving: 366, pct: '+57,400%', halvingYear: 2012, xAdjust: 68 },
    { x: new Date('2017-12-17').getTime(), y: 19800,  _yUSD: 19800,  daysFromHalving: 526, pct: '+13,133%', halvingYear: 2016, xAdjust: 0  },
    { x: new Date('2021-11-10').getTime(), y: 69000,  _yUSD: 69000,  daysFromHalving: 548, pct: '+2,126%',  halvingYear: 2020, xAdjust: 0  },
    { x: new Date('2025-10-06').getTime(), y: 126000, _yUSD: 126000, daysFromHalving: 535, pct: '+713%',    halvingYear: 2024, xAdjust: 0  },
    { x: new Date('2029-07-15').getTime(), y: 201521, _yUSD: 201521, daysFromHalving: 453, pct: '~+623%',  halvingYear: 2028, xAdjust: 0, predicted: true },
];
const CYCLE_BOTTOMS = [
    { x: new Date('2015-01-14').getTime(), y: 150,   _yUSD: 150,   daysFromHalving: 777,  daysFromTop: 411, pct: '-87%',  halvingYear: 2012 },
    { x: new Date('2018-12-15').getTime(), y: 3100,  _yUSD: 3100,  daysFromHalving: 889,  daysFromTop: 363, pct: '-84%',  halvingYear: 2016 },
    { x: new Date('2022-11-21').getTime(), y: 15500, _yUSD: 15500, daysFromHalving: 924,  daysFromTop: 376, pct: '-78%',  halvingYear: 2020 },
    { x: new Date('2026-11-19').getTime(), y: 27800, _yUSD: 27800, daysFromHalving: 944,  daysFromTop: 313, pct: '~-78%', halvingYear: 2024, predicted: true },
];
const HALVINGS = [
    { ts: new Date('2012-11-28').getTime(), label: 'Halving 2012' },
    { ts: new Date('2016-07-09').getTime(), label: 'Halving 2016' },
    { ts: new Date('2020-05-11').getTime(), label: 'Halving 2020' },
    { ts: new Date('2024-04-19').getTime(), label: 'Halving 2024' },
    { ts: new Date('2028-04-18').getTime(), label: 'Halving 2028 (est.)' },
];
const CYCLE_ZONES = [
    { from: new Date('2012-11-28').getTime(), to: new Date('2016-07-09').getTime() },
    { from: new Date('2016-07-09').getTime(), to: new Date('2020-05-11').getTime() },
    { from: new Date('2020-05-11').getTime(), to: new Date('2024-04-19').getTime() },
    { from: new Date('2024-04-19').getTime(), to: new Date('2028-04-18').getTime() },
    { from: new Date('2028-04-18').getTime(), to: new Date('2032-04-01').getTime() },
];

// Predicted top / bottom reference dates and prices (USD)
const SI_EXITS = [
    { label: 'Tier 1 (~65% of top)',  pricePctOfTop: 0.65, sellPct: 0.25, color: '#f7931a' },
    { label: 'Tier 2 (~85% of top)',  pricePctOfTop: 0.85, sellPct: 0.30, color: '#ff6600' },
    { label: 'Tier 3 (top ~Oct 2029)', pricePctOfTop: 1.00, sellPct: 0.35, color: '#ff3333' },
    // keep 10% forever
];

const SI_PRED_BOTTOM = { ts: new Date('2026-11-19').getTime(), priceUSD: 27800 };
const SI_PRED_TOP    = { ts: new Date('2029-07-15').getTime(), priceUSD: 201521 };
const SI_HALVING     = { ts: new Date('2028-04-18').getTime() };
