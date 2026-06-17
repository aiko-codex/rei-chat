import { Sparkles, Wrench, Zap } from 'lucide-react';
import { CHANGELOG, type ChangeKind } from '@/lib/changelog';
import { cn } from '@/lib/utils';

const KIND_META: Record<ChangeKind, { label: string; icon: typeof Sparkles; className: string }> = {
  new: { label: 'New', icon: Sparkles, className: 'bg-primary/10 text-primary' },
  improve: { label: 'Improved', icon: Zap, className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  fix: { label: 'Fixed', icon: Wrench, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The "What's new" timeline — reads the app-bundled CHANGELOG. The running build
 * is highlighted so the user knows which notes apply to what they have.
 */
export function WhatsNewPanel() {
  return (
    <div className="px-4" data-testid="whats-new-panel">
      <p className="px-1 pb-4 pt-1 text-xs leading-relaxed text-muted-foreground">
        A short history of what’s changed in rei — newest first. You’re running{' '}
        <span className="font-medium text-foreground">v{__APP_VERSION__}</span>.
      </p>
      <ol className="space-y-6">
        {CHANGELOG.map((entry, i) => (
          <li key={`${entry.version}-${entry.date}-${i}`} className="relative">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{entry.title}</h3>
              {i === 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  Latest
                </span>
              )}
            </div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              v{entry.version} · {formatDate(entry.date)}
            </p>
            <ul className="space-y-2">
              {entry.changes.map((c, j) => {
                const meta = KIND_META[c.kind];
                const Icon = meta.icon;
                return (
                  <li key={j} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold [&_svg]:size-3',
                        meta.className,
                      )}
                    >
                      <Icon />
                      {meta.label}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground/90">{c.text}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
