'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import type { LogLine } from '@/lib/types';

const STREAM_COLOR: Record<string, string> = {
  stdout: 'text-foreground',
  stderr: 'text-destructive',
  system: 'text-primary',
};

export function LogPanel({ stepLabel, logs }: { stepLabel: string | null; logs: LogLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{stepLabel || 'Select a step to view its logs'}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">No logs yet.</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={STREAM_COLOR[line.stream] || 'text-foreground'}>
              <span className="text-muted-foreground">[{new Date(line.ts).toLocaleTimeString()}]</span> {line.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
