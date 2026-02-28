import { useCommunityStats } from '@/hooks/useCommunityStats';
import { Layers, FileText, Hash } from 'lucide-react';

export function CommunityStats() {
  const { data: stats, isLoading } = useCommunityStats();

  const items = [
    { label: 'Blueprints', value: stats?.totalBlueprints ?? 0, icon: FileText },
    { label: 'Sources', value: stats?.totalSources ?? 0, icon: Layers },
    { label: 'Topics', value: stats?.activeTags ?? 0, icon: Hash },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 py-5 px-3 border border-border/40">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
          <item.icon className="h-4 w-4" />
          <span className="font-mono text-lg tabular-nums text-foreground">
            {isLoading ? '—' : item.value}
          </span>
          <span className="text-sm">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
