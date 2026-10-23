import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = fs.readFileSync(new URL('../viewRates.data.js', import.meta.url), 'utf8');
function fixture(fetchJson) {
  const calls = [];
  const context = vm.createContext({
    VIEW_HISTORY_ACTION: 'getViewDealerRates', LEGACY_RATES_ACTION: 'getDealerRates',
    VIEW_LATEST_ACTION: 'getViewDealerLatest',
    apiUrl: (action, params) => ({ action, ...params }),
    fetchJson: async request => { calls.push(request); return fetchJson(request); }
  });
  vm.runInContext(source.slice(0, source.indexOf('/* ========= Auto refresh')), context);
  return { context, calls };
}

test('initial load preserves legacy liner sizes and retains full history for the viewer', async () => {
  const key = 'Matt||Kelvin Liner||-';
  const data = { ok: true, products: [
    {product: 'Matt', category: 'Kelvin Liner', size: 0.72},
    {product: 'Matt', category: 'Kelvin Liner', size: 0.82},
    {product: 'Matt', category: 'Kelvin Liner', size: '-', historical: true}
  ], wefDates: ['2026-01-15', '2026-05-01'], rates: {
    '2026-01-15': {[key]: {rate: 315}}, '2026-05-01': {[key]: {rate: 325}}
  }};
  const f = fixture(async () => data);
  const result = await vm.runInContext("fetchLatestDealerData_('Test Dealer')", f.context);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].action, 'getViewDealerRates');
  assert.equal(f.calls[0].dealer, 'Test Dealer');
  assert.equal(result.optimized, false);
  assert.equal(result.data, data);

  // Exercise the real view derivation and default hide-no-rate behavior.
  Object.assign(f.context, {LAST_DATA: result.data, WEF_MODE: 'latest',
    VIEW_DATA_CACHE: {}, HIDE_NO_RATE: true,
    toProductKey: p => `${p.product}||${p.category}||${p.size}`,
    hasRateCell: c => !!c && Number(c.rate) !== 0,
    hasGolaCell: () => false});
  vm.runInContext(fs.readFileSync(new URL('../viewRates.logic.js', import.meta.url), 'utf8'), f.context);
  const rendered = vm.runInContext('getRenderProducts_(getViewData())', f.context);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].size, '-');
  assert.equal(vm.runInContext("getViewData()._derived.productMeta['Matt||Kelvin Liner||-'].latestCell.rate", f.context), 325);
});

for (const failure of ['network', 'unsupported']) {
  test(`legacy endpoint fallback on ${failure}`, async () => {
    const data = {ok: true, products: [], rates: {}};
    const f = fixture(async ({action}) => {
      if (action === 'getViewDealerRates') {
        if (failure === 'network') throw Error('Network');
        return {ok: false, error: 'Unknown action'};
      }
      return data;
    });
    const result = await vm.runInContext("fetchLatestDealerData_('Test Dealer')", f.context);
    assert.equal(result.data, data);
    assert.deepEqual(f.calls.map(c => c.action), ['getViewDealerRates', 'getDealerRates']);
  });
}
