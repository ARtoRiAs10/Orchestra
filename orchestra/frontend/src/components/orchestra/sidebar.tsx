'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { GitBranch, Server, CreditCard, AudioWaveform } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/pipelines', label: 'Pipelines', icon: GitBranch },
  { href: '/fleet', label: 'Fleet', icon: Server },
  { href: '/billing', label: 'Billing', icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-foreground))]">
      <div className="flex items-center gap-2.5 border-b border-[hsl(var(--sidebar-border))] px-5 py-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <AudioWaveform className="h-4 w-4 text-primary-foreground" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-white">Orchestra</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-muted))]">
          Workspace
        </p>
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-foreground))]'
                  : 'text-[hsl(var(--sidebar-foreground))] hover:bg-white/5 hover:text-white'
              )}
            >
              {active && (
                <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-primary" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-[hsl(var(--sidebar-border))] px-5 py-4">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-xs text-[hsl(var(--sidebar-muted))]">Account</span>
      </div>
    </aside>
  );
}
