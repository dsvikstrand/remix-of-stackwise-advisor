export type HotnessTier = 'fresh_seed' | 'rising_clover' | 'rising_lucky' | 'hot_palm' | 'legend_dragon';

export type HotnessView = {
  tier: HotnessTier;
  points: number;
  label: string;
  tierName: string;
  badgeClassName: string;
  surfaceClassName: string;
};

export function computeHotnessPoints(input: { likes: number; comments: number }) {
  const likes = Number.isFinite(input.likes) ? Math.max(0, Math.floor(input.likes)) : 0;
  const comments = Number.isFinite(input.comments) ? Math.max(0, Math.floor(input.comments)) : 0;
  return likes + comments * 2;
}

function getHotnessTier(points: number): HotnessTier {
  if (points >= 40) return 'legend_dragon';
  if (points >= 16) return 'hot_palm';
  if (points >= 6) return 'rising_lucky';
  if (points >= 1) return 'rising_clover';
  return 'fresh_seed';
}

export function getHotnessView(input: { likes: number; comments: number }): HotnessView {
  const points = computeHotnessPoints(input);
  const tier = getHotnessTier(points);
  switch (tier) {
    case 'legend_dragon':
      return {
        tier,
        points,
        label: '🐉',
        tierName: 'Legend',
        badgeClassName: 'border-amber-400/50 bg-amber-500/15 text-amber-100',
        surfaceClassName: 'border-amber-400/45 bg-amber-500/12',
      };
    case 'hot_palm':
      return {
        tier,
        points,
        label: '🌴',
        tierName: 'Hot',
        badgeClassName: 'border-orange-400/45 bg-orange-500/15 text-orange-100',
        surfaceClassName: 'border-orange-400/40 bg-orange-500/12',
      };
    case 'rising_lucky':
      return {
        tier,
        points,
        label: '🍀',
        tierName: 'Rising+',
        badgeClassName: 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100',
        surfaceClassName: 'border-emerald-400/40 bg-emerald-500/12',
      };
    case 'rising_clover':
      return {
        tier,
        points,
        label: '☘️',
        tierName: 'Rising',
        badgeClassName: 'border-green-400/45 bg-green-500/15 text-green-100',
        surfaceClassName: 'border-green-400/40 bg-green-500/12',
      };
    default:
      return {
        tier,
        points,
        label: '🌱',
        tierName: 'Fresh',
        badgeClassName: 'border-lime-400/45 bg-lime-500/15 text-lime-100',
        surfaceClassName: 'border-lime-400/40 bg-lime-500/12',
      };
  }
}
