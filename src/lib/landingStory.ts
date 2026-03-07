export type LandingDemoVariant = 'signal' | 'blueprint' | 'lanes' | 'community';
export type LandingBackgroundGlyphShape = 'circle' | 'diamond' | 'capsule' | 'ring' | 'spark' | 'cross';

export interface LandingStoryScene {
  id: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  demoVariant: LandingDemoVariant;
  accentClass: string;
}

export interface LandingStep {
  id: string;
  title: string;
  description: string;
}

export interface LandingLaneCard {
  id: string;
  title: string;
  description: string;
  stateLabel: string;
}

export interface LandingValuePoint {
  id: string;
  title: string;
  description: string;
}

export interface LandingBackgroundGlyph {
  id: string;
  shape: LandingBackgroundGlyphShape;
  left: string;
  top: string;
  size: number;
  mobileSize?: number;
  depth: 'far' | 'mid' | 'near';
  toneClassName: string;
  desktopOnly?: boolean;
  desktopPath: string;
  mobilePath?: string;
  startProgress?: number;
  endProgress?: number;
  startRotate?: number;
  endRotate?: number;
  startScale?: number;
  endScale?: number;
  startOpacity?: number;
  endOpacity?: number;
}

export const LANDING_STORY_SCENES: LandingStoryScene[] = [
  {
    id: 'signal-buried',
    eyebrow: 'Too much to watch',
    headline: 'YouTube is full of value. Most of it gets buried.',
    subheadline:
      'Great videos compete with endless watch time. Bleu starts by pulling the useful parts to the surface.',
    demoVariant: 'signal',
    accentClass: 'from-primary/25 via-amber-200/30 to-orange-300/20',
  },
  {
    id: 'blueprint-fast',
    eyebrow: 'Scan, do, move on',
    headline: 'Bleu turns long videos into blueprints you can scan in seconds.',
    subheadline:
      'Instead of rewatching or scrubbing timestamps, get the structure, takeaways, and next steps in one place.',
    demoVariant: 'blueprint',
    accentClass: 'from-orange-300/20 via-primary/15 to-amber-200/30',
  },
  {
    id: 'sources-and-topics',
    eyebrow: 'Personalized discovery',
    headline: 'Follow sources. Join topics. Skip the noise.',
    subheadline:
      'For You stays source-driven. Joined keeps you in the loop on the topics you actually care about.',
    demoVariant: 'lanes',
    accentClass: 'from-primary/20 via-rose-200/20 to-amber-100/30',
  },
  {
    id: 'community-payoff',
    eyebrow: 'Stay current without the hours',
    headline: 'Find the best new videos without spending hours watching everything.',
    subheadline:
      'One unlock can help everyone. Bleu turns good finds into reusable knowledge and better discovery.',
    demoVariant: 'community',
    accentClass: 'from-amber-200/30 via-primary/15 to-orange-200/25',
  },
];

export const LANDING_HOW_IT_WORKS: LandingStep[] = [
  {
    id: 'follow',
    title: 'Follow the right sources',
    description: 'Subscribe to creators you trust so their new uploads land in For You.',
  },
  {
    id: 'generate',
    title: 'Generate the useful version',
    description: 'Turn long videos into structured blueprints you can scan in seconds.',
  },
  {
    id: 'discover',
    title: 'Discover by topic',
    description: 'Join Bleu channels to browse the best published blueprints by interest.',
  },
];

export const LANDING_LANE_CARDS: LandingLaneCard[] = [
  {
    id: 'for-you',
    title: 'For You',
    description: 'Your source-driven lane. It can contain locked items and ready blueprints.',
    stateLabel: 'locked + ready',
  },
  {
    id: 'joined',
    title: 'Joined',
    description: 'A filtered published feed for the Bleu channels you joined.',
    stateLabel: 'published only',
  },
  {
    id: 'all',
    title: 'All',
    description: 'The global published blueprint feed across all Bleu channels.',
    stateLabel: 'published only',
  },
];

export const LANDING_VALUE_POINTS: LandingValuePoint[] = [
  {
    id: 'consume-less',
    title: 'Spend less time watching',
    description: 'Understand the core without sitting through every full video end to end.',
  },
  {
    id: 'discover-better',
    title: 'Discover better sources',
    description: 'Use channels and community signals to find videos you would not have discovered from subscriptions alone.',
  },
  {
    id: 'reuse-what-works',
    title: 'Keep what is worth revisiting',
    description: 'Turn the best videos into reusable notes, routines, and shared reference points.',
  },
];

export const LANDING_BACKGROUND_GLYPHS: LandingBackgroundGlyph[] = [
  {
    id: 'glyph-spark-northwest',
    shape: 'spark',
    left: '2%',
    top: '9%',
    size: 58,
    mobileSize: 32,
    depth: 'far',
    toneClassName: 'text-orange-500/86 drop-shadow-[0_0_18px_rgba(249,115,22,0.22)]',
    desktopPath: 'M 3 15 C 4 11, 7 8, 12 10',
    mobilePath: 'M 5 18 C 6 14, 8 12, 12 13',
    startProgress: 0.04,
    endProgress: 0.62,
    startRotate: -18,
    endRotate: 18,
    startScale: 0.96,
    endScale: 1.08,
    startOpacity: 0.62,
    endOpacity: 0.9,
  },
  {
    id: 'glyph-capsule-top',
    shape: 'capsule',
    left: '24%',
    top: '4.5%',
    size: 212,
    mobileSize: 108,
    depth: 'far',
    toneClassName: 'bg-amber-200/92 shadow-[0_0_84px_rgba(252,211,77,0.34)]',
    desktopPath: 'M 18 7 C 34 2, 54 13, 78 6',
    mobilePath: 'M 12 8 C 20 5, 29 11, 40 7',
    startProgress: 0.04,
    endProgress: 0.96,
    startRotate: -10,
    endRotate: 12,
    startScale: 0.98,
    endScale: 1.06,
    startOpacity: 0.58,
    endOpacity: 0.84,
  },
  {
    id: 'glyph-circle-east',
    shape: 'circle',
    left: '92%',
    top: '8%',
    size: 136,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'bg-primary/62 shadow-[0_0_60px_rgba(168,85,247,0.28)]',
    desktopOnly: true,
    desktopPath: 'M 97 14 C 94 10, 88 18, 76 24 C 71 27, 74 33, 80 32',
    startProgress: 0.02,
    endProgress: 0.98,
    startRotate: -2,
    endRotate: 6,
    startScale: 0.96,
    endScale: 1.12,
    startOpacity: 0.52,
    endOpacity: 0.76,
  },
  {
    id: 'glyph-diamond-west',
    shape: 'diamond',
    left: '4%',
    top: '72%',
    size: 88,
    mobileSize: 48,
    depth: 'mid',
    toneClassName: 'bg-orange-300/88 shadow-[0_0_56px_rgba(245,158,11,0.4)]',
    desktopPath: 'M 5 84 C 8 88, 15 84, 21 76 C 24 72, 26 68, 29 66',
    mobilePath: 'M 6 84 C 9 86, 14 82, 19 76',
    startProgress: 0.06,
    endProgress: 0.7,
    startRotate: 18,
    endRotate: -26,
    startScale: 0.96,
    endScale: 1.1,
    startOpacity: 0.56,
    endOpacity: 0.82,
  },
  {
    id: 'glyph-circle-southwest',
    shape: 'circle',
    left: '11%',
    top: '90%',
    size: 66,
    mobileSize: 36,
    depth: 'far',
    toneClassName: 'bg-rose-200/82 shadow-[0_0_42px_rgba(251,113,133,0.24)]',
    desktopPath: 'M 64 92 C 72 96, 84 92, 93 88',
    mobilePath: 'M 62 92 C 70 94, 78 91, 86 88',
    startProgress: 0.08,
    endProgress: 0.58,
    startScale: 0.92,
    endScale: 1.06,
    startOpacity: 0.44,
    endOpacity: 0.66,
  },
  {
    id: 'glyph-cross-southeast',
    shape: 'cross',
    left: '89%',
    top: '82%',
    size: 60,
    mobileSize: 28,
    depth: 'near',
    toneClassName: 'text-primary/82 drop-shadow-[0_0_14px_rgba(168,85,247,0.18)]',
    desktopPath: 'M 88 86 C 84 84, 80 83, 76 84',
    mobilePath: 'M 82 84 C 78 83, 74 83, 70 84',
    startProgress: 0.06,
    endProgress: 0.32,
    startRotate: 10,
    endRotate: -16,
    startScale: 0.96,
    endScale: 1.04,
    startOpacity: 0.56,
    endOpacity: 0.82,
  },
];
