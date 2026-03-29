import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function makeContext(globals = {}) {
    return vm.createContext({
        Math, Date, Array, Number, String, Boolean, Object,
        JSON, Set, Map, console, RegExp, Error,
        parseInt, parseFloat, isFinite, isNaN, Infinity, NaN,
        // Default browser globals (overridable via globals param)
        currencySymbol: '$',
        currencyRate: 1,
        predLineUSD: null,
        dates: [],
        pricesUSD: [],
        document: {
            getElementById: () => ({
                value: '0', textContent: '',
                addEventListener: () => {},
                style: { display: '' }
            })
        },
        ...globals,
    });
}

export function load(ctx, ...filenames) {
    for (const filename of filenames) {
        const filepath = path.resolve(__dirname, '..', 'js', filename);
        const code = fs.readFileSync(filepath, 'utf8');
        vm.runInContext(code, ctx);
    }
    return ctx;
}

/**
 * Retrieve a value from the vm context by name or expression.
 * Needed because `const`-declared variables in vm scripts are NOT added as
 * properties on the context object — only `var` and `function` declarations are.
 */
export function get(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

/**
 * Call a named function defined inside the vm context, passing host-side args.
 * Works for both `const fn = ...` and `function fn(...)` declarations.
 */
export function call(ctx, name, ...args) {
    ctx.__callArgs__ = args;
    return vm.runInContext(`${name}(...__callArgs__)`, ctx);
}
