import { mergePreferences, preferencesFromApi, DEFAULT_PREFERENCES } from './preferences.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const merged = mergePreferences(DEFAULT_PREFERENCES, { theme: 'light' });
assert(merged.theme === 'light', 'theme updates');
assert(merged.pageSize === 25, 'unrelated page size stays');

const withModule = mergePreferences(merged, { modules: { '39': { pageSize: 50, sortKey: 'product_name' } } });
const kept = mergePreferences(withModule, { modules: { '39': { sortAsc: false } } });
assert(kept.modules['39'].pageSize === 50, 'module page size is kept');
assert(kept.modules['39'].sortKey === 'product_name', 'module sort is kept');
assert(kept.modules['39'].sortAsc === false, 'sort direction updates');

const fromServer = preferencesFromApi({
  theme: 'system',
  text_size: 'lg',
  page_size: 100,
  landing_screen_id: 40,
  modules: { '39': { hidden_columns: ['image'], page_size: 25 } },
});
assert(fromServer.theme === 'system', 'system theme');
assert(fromServer.textSize === 'lg', 'text size');
assert(fromServer.pageSize === 100, 'page size');
assert(fromServer.landingScreenId === 40, 'landing page');
assert(fromServer.modules['39'].hiddenColumns?.[0] === 'image', 'hidden column');

const junk = preferencesFromApi({ theme: 'neon', page_size: 7 });
assert(junk.theme === 'dark', 'invalid theme falls back');
assert(junk.pageSize === 25, 'invalid page size falls back');

console.log('preferences tests passed');
