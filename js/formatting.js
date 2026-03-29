// ── Helpers ───────────────────────────────────────────────────────────────────
// These depend on the currencySymbol global (set by main.js / switchCurrency)

const fmtPrice = v => currencySymbol + Math.round(v).toLocaleString('en-US');
const fmtMult  = v => v >= 100 ? v.toFixed(0) + 'x' : v.toFixed(1) + 'x';
const fmtDate  = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtPct   = v => (v * 100).toFixed(1) + '%';

function fmtSI(val) {
    // Format in current currency
    if (val == null || !isFinite(val)) return '—';
    const sym = currencySymbol;
    if (val >= 1e6) return sym + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return sym + Math.round(val).toLocaleString();
    return sym + val.toFixed(0);
}
