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
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <AudioWaveform className="h-5 w-5 text-primary" />
        <span className="text-lg font-semibold tracking-tight">Orchestra</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-border px-5 py-4">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-xs text-muted-foreground">Account</span>
      </div>
    </aside>
  );
}
