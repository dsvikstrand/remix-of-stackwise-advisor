export type ChannelColorView = {
  badgeClassName: string;
  surfaceClassName: string;
};

const CHANNEL_COLOR_PALETTE: ChannelColorView[] = [
  { badgeClassName: 'border-sky-400/40 bg-sky-500/14 text-foreground/85', surfaceClassName: 'border-sky-400/35 bg-sky-500/10' },
  { badgeClassName: 'border-cyan-400/40 bg-cyan-500/14 text-foreground/85', surfaceClassName: 'border-cyan-400/35 bg-cyan-500/10' },
  { badgeClassName: 'border-blue-400/40 bg-blue-500/14 text-foreground/85', surfaceClassName: 'border-blue-400/35 bg-blue-500/10' },
  { badgeClassName: 'border-indigo-400/40 bg-indigo-500/14 text-foreground/85', surfaceClassName: 'border-indigo-400/35 bg-indigo-500/10' },
  { badgeClassName: 'border-violet-400/40 bg-violet-500/14 text-foreground/85', surfaceClassName: 'border-violet-400/35 bg-violet-500/10' },
  { badgeClassName: 'border-fuchsia-400/40 bg-fuchsia-500/14 text-foreground/85', surfaceClassName: 'border-fuchsia-400/35 bg-fuchsia-500/10' },
  { badgeClassName: 'border-rose-400/40 bg-rose-500/14 text-foreground/85', surfaceClassName: 'border-rose-400/35 bg-rose-500/10' },
  { badgeClassName: 'border-orange-400/40 bg-orange-500/14 text-foreground/85', surfaceClassName: 'border-orange-400/35 bg-orange-500/10' },
  { badgeClassName: 'border-amber-400/40 bg-amber-500/14 text-foreground/85', surfaceClassName: 'border-amber-400/35 bg-amber-500/10' },
  { badgeClassName: 'border-lime-400/40 bg-lime-500/14 text-foreground/85', surfaceClassName: 'border-lime-400/35 bg-lime-500/10' },
  { badgeClassName: 'border-emerald-400/40 bg-emerald-500/14 text-foreground/85', surfaceClassName: 'border-emerald-400/35 bg-emerald-500/10' },
  { badgeClassName: 'border-teal-400/40 bg-teal-500/14 text-foreground/85', surfaceClassName: 'border-teal-400/35 bg-teal-500/10' },
];

const NEUTRAL_CHANNEL_COLOR: ChannelColorView = {
  badgeClassName: 'border-border/60 bg-muted/40 text-foreground/80',
  surfaceClassName: 'border-border/60 bg-muted/35',
};

function hashSlug(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getChannelColorView(channelSlug: string | null | undefined): ChannelColorView {
  const slug = String(channelSlug || '').trim().toLowerCase();
  if (!slug) return NEUTRAL_CHANNEL_COLOR;
  const index = hashSlug(slug) % CHANNEL_COLOR_PALETTE.length;
  return CHANNEL_COLOR_PALETTE[index] || NEUTRAL_CHANNEL_COLOR;
}
