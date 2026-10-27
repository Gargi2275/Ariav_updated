import React, { useMemo, useState } from 'react';
import { Monitor, RotateCcw } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ERP_SCREENS } from '../../types/erp';
import { canUseLanding, usePreferences } from '../../context/PreferencesContext';
import { Density, MotionPreference, PageSize, SidebarPreference, TextSize, ThemePreference } from '../../services/preferences';

const SHORTCUTS = [
  { keys: 'Ctrl + K or Cmd + K', action: 'Open module search' },
  { keys: 'Escape', action: 'Close module search and this page’s menus' },
  { keys: 'Tab and Shift + Tab', action: 'Move between controls' },
  { keys: 'Enter or Space', action: 'Activate the focused button' },
];

function Choice<T extends string>({
  label,
  value,
  current,
  onSelect,
  hint,
}: {
  label: string;
  value: T;
  current: T;
  onSelect: (value: T) => void;
  hint?: string;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={`rounded-md border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] ${selected ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/10' : 'border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] hover:border-[var(--erp-gold)]'}`}
    >
      <span className="block text-sm font-medium text-[var(--erp-text)]">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-[var(--erp-muted)]">{hint}</span> : null}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
      <h2 className="font-display text-lg font-semibold text-[var(--erp-text)]">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export const PreferencesScreen: React.FC = () => {
  const { userRole } = useErp();
  const { preferences, saveState, saveError, update, reset } = usePreferences();
  const [shortcutQuery, setShortcutQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const product = preferences.modules['39'] || {};
  const hidden = new Set(product.hiddenColumns || []);

  const landings = useMemo(
    () => ERP_SCREENS.filter(screen => canUseLanding(screen.id, userRole)),
    [userRole],
  );
  const shortcuts = SHORTCUTS.filter(item => `${item.keys} ${item.action}`.toLowerCase().includes(shortcutQuery.trim().toLowerCase()));

  const setTheme = (theme: ThemePreference) => { void update({ theme }); };
  const setDensity = (density: Density) => { void update({ density }); };
  const setText = (textSize: TextSize) => { void update({ textSize }); };
  const setMotion = (reducedMotion: MotionPreference) => { void update({ reducedMotion }); };
  const setTable = (tableDensity: Density) => { void update({ tableDensity }); };
  const setPage = (pageSize: PageSize) => { void update({ pageSize }); };
  const setSidebar = (sidebar: SidebarPreference) => { void update({ sidebar }); };

  const toggleColumn = (column: 'image' | 'category') => {
    const next = new Set(hidden);
    if (next.has(column)) next.delete(column);
    else next.add(column);
    void update({ modules: { '39': { ...product, hiddenColumns: [...next] } } });
  };

  const status = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : 'Ready';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 text-left sm:p-6">
      <header className="flex flex-col gap-3 border-b border-[var(--erp-hairline-strong)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[var(--erp-muted)]">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-[var(--erp-text)]">My Preferences</span>
          </nav>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--erp-text)] sm:text-3xl">My Preferences</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--erp-muted)]">
            Personal display and navigation settings for this account. They do not change products, prices, or other people’s access.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-[var(--erp-muted)]" role="status" aria-live="polite">{status}</p>
          <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--erp-hairline-strong)] px-3 text-sm text-[var(--erp-text)] hover:border-[var(--erp-gold)]">
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </button>
        </div>
      </header>
      {saveError ? <p className="rounded-md border border-[var(--erp-negative)]/40 bg-[var(--erp-negative)]/10 px-3 py-2 text-sm text-[var(--erp-negative)]" role="alert">{saveError}</p> : null}

      <Section title="Appearance">
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Theme</legend>
          <p className="mb-2 text-xs text-[var(--erp-muted)]">System follows this device’s light or dark setting.</p>
          <div className="grid gap-2 sm:grid-cols-3" aria-label="Theme">
            <Choice label="Light" value="light" current={preferences.theme} onSelect={setTheme} hint="Paper Ledger" />
            <Choice label="Dark" value="dark" current={preferences.theme} onSelect={setTheme} hint="Ledger Terminal" />
            <Choice label="System" value="system" current={preferences.theme} onSelect={setTheme} hint="Match the device" />
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Interface density</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3" aria-label="Interface density">
            <Choice label="Compact" value="compact" current={preferences.density} onSelect={setDensity} hint="Tighter shell controls" />
            <Choice label="Comfortable" value="comfortable" current={preferences.density} onSelect={setDensity} hint="Standard spacing" />
            <Choice label="Spacious" value="spacious" current={preferences.density} onSelect={setDensity} hint="Larger shell controls" />
          </div>
        </fieldset>
      </Section>

      <Section title="Readability and accessibility">
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Text size</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Text size">
            <Choice label="Small" value="sm" current={preferences.textSize} onSelect={setText} />
            <Choice label="Medium" value="md" current={preferences.textSize} onSelect={setText} />
            <Choice label="Large" value="lg" current={preferences.textSize} onSelect={setText} />
            <Choice label="Extra large" value="xl" current={preferences.textSize} onSelect={setText} />
          </div>
        </fieldset>
        <label className="flex items-start gap-3 text-sm text-[var(--erp-text)]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--erp-gold)]" checked={preferences.highContrast} onChange={event => { void update({ highContrast: event.target.checked }); }} />
          <span><span className="font-medium">High contrast</span><span className="mt-0.5 block text-xs text-[var(--erp-muted)]">Stronger text, borders, and status colors. Status labels stay written out.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-[var(--erp-text)]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--erp-gold)]" checked={preferences.largeTargets} onChange={event => { void update({ largeTargets: event.target.checked }); }} />
          <span><span className="font-medium">Larger controls</span><span className="mt-0.5 block text-xs text-[var(--erp-muted)]">Increases the hit area of buttons, fields, and checkboxes in the page content.</span></span>
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Motion</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3" aria-label="Motion">
            <Choice label="System" value="system" current={preferences.reducedMotion} onSelect={setMotion} hint="Follow the device" />
            <Choice label="Reduce" value="reduce" current={preferences.reducedMotion} onSelect={setMotion} hint="Shorten animation" />
            <Choice label="Allow" value="allow" current={preferences.reducedMotion} onSelect={setMotion} hint="Keep motion" />
          </div>
        </fieldset>
      </Section>

      <Section title="Tables and data display">
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Table density</legend>
          <p className="mb-2 text-xs text-[var(--erp-muted)]">Applies to shared tables and Product Master. Actions and required columns stay available.</p>
          <div className="grid gap-2 sm:grid-cols-3" aria-label="Table density">
            <Choice label="Compact" value="compact" current={preferences.tableDensity} onSelect={setTable} />
            <Choice label="Comfortable" value="comfortable" current={preferences.tableDensity} onSelect={setTable} />
            <Choice label="Spacious" value="spacious" current={preferences.tableDensity} onSelect={setTable} />
          </div>
        </fieldset>
        <label className="flex max-w-xs flex-col gap-1 text-sm text-[var(--erp-text)]">
          Default page size
          <select
            value={preferences.pageSize}
            onChange={event => setPage(Number(event.target.value) as PageSize)}
            className="h-10 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3"
          >
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
          <span className="text-xs text-[var(--erp-muted)]">Used when a module has not saved its own page size.</span>
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Product Master columns</legend>
          <p className="mb-2 text-xs text-[var(--erp-muted)]">Code, name, brand, prices, availability, status, and actions stay visible.</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--erp-gold)]" checked={!hidden.has('image')} onChange={() => toggleColumn('image')} /> Show image</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--erp-gold)]" checked={!hidden.has('category')} onChange={() => toggleColumn('category')} /> Show category when categories are enabled</label>
          </div>
        </fieldset>
      </Section>

      <Section title="Navigation and keyboard shortcuts">
        <fieldset>
          <legend className="text-sm font-medium text-[var(--erp-text)]">Sidebar</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Sidebar">
            <Choice label="Expanded" value="expanded" current={preferences.sidebar} onSelect={setSidebar} hint="Icons and labels" />
            <Choice label="Collapsed" value="collapsed" current={preferences.sidebar} onSelect={setSidebar} hint="Icons only" />
          </div>
        </fieldset>
        <label className="flex max-w-md flex-col gap-1 text-sm text-[var(--erp-text)]">
          Search shortcuts
          <input value={shortcutQuery} onChange={event => setShortcutQuery(event.target.value)} className="h-10 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3" placeholder="Search shortcuts" />
        </label>
        <ul className="divide-y divide-[var(--erp-hairline)] rounded-md border border-[var(--erp-hairline)]">
          {shortcuts.length ? shortcuts.map(item => (
            <li key={item.keys} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-xs text-[var(--erp-text)]">{item.keys}</span>
              <span className="text-sm text-[var(--erp-muted)]">{item.action}</span>
            </li>
          )) : <li className="px-3 py-3 text-sm text-[var(--erp-muted)]">No shortcuts match that search.</li>}
        </ul>
      </Section>

      <Section title="Default workspace and landing page">
        <label className="flex max-w-md flex-col gap-1 text-sm text-[var(--erp-text)]">
          Open this screen after the next sign-in
          <select
            value={preferences.landingScreenId ?? ''}
            onChange={event => { void update({ landingScreenId: event.target.value ? Number(event.target.value) : null }); }}
            className="h-10 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3"
          >
            <option value="">Business Analytics</option>
            {landings.filter(screen => screen.id !== 6).map(screen => (
              <option key={screen.id} value={screen.id}>{screen.title}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--erp-muted)]">Only screens this account can already open are listed.</span>
        </label>
        <p className="flex items-center gap-2 text-xs text-[var(--erp-muted)]"><Monitor className="h-3.5 w-3.5" /> A refresh keeps the screen you are already using. The landing page applies at the next sign-in.</p>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        entityType="preferences"
        entityLabel="My Preferences"
        title="Reset personal preferences?"
        message="Theme, text size, table layout, sidebar, and landing page return to the defaults for this account. Business records stay as they are."
        confirmLabel="Reset"
        busyLabel="Resetting…"
        confirmTone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          await reset();
          setConfirmReset(false);
        }}
      />
    </div>
  );
};
