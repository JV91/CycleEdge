#!/usr/bin/env node
// Run with: node scripts/update-data.js
// Updates data/btc.json and data/mstr.json with latest prices.

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        }).on('error', reject);
    });
}

async function updateBTC() {
    console.log('Fetching BTC history...');

    // Early history from blockchain.info (2010+)
    const raw1 = await get('https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false');
    const blockchain = JSON.parse(raw1).values
        .filter(v => v.y > 0)
        .map(v => ({ ts: v.x * 1000, price: Math.round(v.y * 100) / 100 }));

    // Recent history from Binance (2017+, more accurate)
    const allBinance = [];
    let endTime = null;
    for (let i = 0; i < 20; i++) {
        const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000'
            + (endTime ? '&endTime=' + endTime : '');
        const batch = JSON.parse(await get(url));
        if (!batch.length) break;
        allBinance.push(...batch);
        endTime = batch[0][0] - 1;
        if (batch.length < 1000) break;
        await new Promise(r => setTimeout(r, 300));
    }
    const binanceStart = allBinance.length ? Math.min(...allBinance.map(k => k[0])) : Infinity;
    const binance = allBinance
        .filter(k => parseFloat(k[4]) > 0)
        .map(k => ({ ts: k[0], price: Math.round(parseFloat(k[4]) * 100) / 100 }));

    // Merge: blockchain up to Binance start, then Binance
    const early = blockchain.filter(p => p.ts < binanceStart);
    const seen = new Set();
    const merged = [...early, ...binance]
        .filter(p => { if (seen.has(p.ts)) return false; seen.add(p.ts); return true; })
        .sort((a, b) => a.ts - b.ts);

    fs.writeFileSync(path.join(DATA_DIR, 'btc.json'), JSON.stringify(merged));
    console.log(`BTC: ${merged.length} points, ${merged[0].ts} → ${merged[merged.length - 1].ts}`);
}

async function updateMSTR() {
    console.log('Fetching MSTR history...');
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/MSTR?interval=1d&range=20y';
    const raw = await get(url);
    const json = JSON.parse(raw);
    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const pts = timestamps
        .map((ts, i) => ({ x: ts * 1000, y: closes[i] }))
        .filter(p => p.y != null && p.y > 0);

    fs.writeFileSync(path.join(DATA_DIR, 'mstr.json'), JSON.stringify(pts));
    console.log(`MSTR: ${pts.length} points, last: ${pts[pts.length - 1].x} = $${pts[pts.length - 1].y.toFixed(2)}`);
}

(async () => {
    try {
        await updateBTC();
        await updateMSTR();
        console.log('Done. Commit data/btc.json and data/mstr.json.');
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
})();
