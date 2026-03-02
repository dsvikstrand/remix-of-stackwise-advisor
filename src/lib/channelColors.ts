export type ChannelColorView = {
  badgeClassName: string;
  surfaceClassName: string;
};

const CHANNEL_COLOR_PALETTE: ChannelColorView[] = [
  { badgeClassName: 'border-sky-400/28 bg-sky-500/8 text-foreground/80', surfaceClassName: 'border-sky-400/24 bg-sky-500/6' },
  { badgeClassName: 'border-cyan-400/28 bg-cyan-500/8 text-foreground/80', surfaceClassName: 'border-cyan-400/24 bg-cyan-500/6' },
  { badgeClassName: 'border-blue-400/28 bg-blue-500/8 text-foreground/80', surfaceClassName: 'border-blue-400/24 bg-blue-500/6' },
  { badgeClassName: 'border-indigo-400/28 bg-indigo-500/8 text-foreground/80', surfaceClassName: 'border-indigo-400/24 bg-indigo-500/6' },
  { badgeClassName: 'border-violet-400/28 bg-violet-500/8 text-foreground/80', surfaceClassName: 'border-violet-400/24 bg-violet-500/6' },
  { badgeClassName: 'border-fuchsia-400/28 bg-fuchsia-500/8 text-foreground/80', surfaceClassName: 'border-fuchsia-400/24 bg-fuchsia-500/6' },
  { badgeClassName: 'border-rose-400/28 bg-rose-500/8 text-foreground/80', surfaceClassName: 'border-rose-400/24 bg-rose-500/6' },
  { badgeClassName: 'border-orange-400/28 bg-orange-500/8 text-foreground/80', surfaceClassName: 'border-orange-400/24 bg-orange-500/6' },
  { badgeClassName: 'border-amber-400/28 bg-amber-500/8 text-foreground/80', surfaceClassName: 'border-amber-400/24 bg-amber-500/6' },
  { badgeClassName: 'border-lime-400/28 bg-lime-500/8 text-foreground/80', surfaceClassName: 'border-lime-400/24 bg-lime-500/6' },
  { badgeClassName: 'border-emerald-400/28 bg-emerald-500/8 text-foreground/80', surfaceClassName: 'border-emerald-400/24 bg-emerald-500/6' },
  { badgeClassName: 'border-teal-400/28 bg-teal-500/8 text-foreground/80', surfaceClassName: 'border-teal-400/24 bg-teal-500/6' },
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
