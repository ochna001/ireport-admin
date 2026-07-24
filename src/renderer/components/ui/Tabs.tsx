export type TabVariant = 'underline' | 'pills' | 'segmented';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: TabVariant;
  ariaLabel: string;
  className?: string;
}

const WRAP_CLASS: Record<TabVariant, string> = {
  underline: 'flex gap-1 overflow-x-auto border-b border-border-token',
  pills: 'inline-flex items-center gap-1 rounded-lg bg-surface-subtle p-1',
  segmented: 'inline-flex items-center gap-1 rounded-xl border border-border-token bg-surface p-1 shadow-sm',
};

function tabClass(variant: TabVariant, isActive: boolean): string {
  switch (variant) {
    case 'underline':
      return `-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-fg-muted hover:text-fg-strong'
      }`;
    case 'pills':
      return `flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive
          ? 'bg-surface text-fg-strong shadow-sm'
          : 'text-fg-muted hover:text-fg-default'
      }`;
    case 'segmented':
      return `min-h-9 flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive
          ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
          : 'text-fg-muted hover:bg-surface-subtle'
      }`;
  }
}

/**
 * One tab visual language for the whole app, with three variants matching
 * where the tabs live: `underline` for page-level sections (Agencies,
 * IncidentDetail), `pills` for in-card switches (Reports), `segmented` for
 * compact toolbars (Dashboard workspace view).
 */
export function Tabs({ tabs, value, onChange, variant = 'underline', ariaLabel, className = '' }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`${WRAP_CLASS[variant]} ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={tabClass(variant, isActive)}
          >
            {Icon && <Icon size={16} />}
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
