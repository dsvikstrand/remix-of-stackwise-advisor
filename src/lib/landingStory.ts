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
  xRange: [number, number];
  yRange: [number, number];
  rotateRange?: [number, number];
  scaleRange?: [number, number];
  opacityRange?: [number, number];
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
    xRange: [0, 56],
    yRange: [0, -12],
    rotateRange: [-18, 18],
    opacityRange: [0.58, 0.9],
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
    xRange: [0, 208],
    yRange: [0, 12],
    rotateRange: [-12, 12],
    opacityRange: [0.52, 0.82],
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
    xRange: [0, -124],
    yRange: [0, 18],
    rotateRange: [0, 0],
    scaleRange: [0.94, 1.16],
    opacityRange: [0.48, 0.74],
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
    xRange: [0, 66],
    yRange: [0, -52],
    rotateRange: [20, -32],
    scaleRange: [0.94, 1.12],
    opacityRange: [0.5, 0.82],
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
    xRange: [0, 54],
    yRange: [0, -18],
    scaleRange: [0.9, 1.08],
    opacityRange: [0.44, 0.66],
  },
  {
    id: 'glyph-capsule-right',
    shape: 'capsule',
    left: '94%',
    top: '28%',
    size: 152,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'bg-orange-200/84 shadow-[0_0_44px_rgba(251,146,60,0.26)]',
    desktopOnly: true,
    xRange: [0, -40],
    yRange: [0, 126],
    rotateRange: [12, -18],
    opacityRange: [0.46, 0.68],
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
    xRange: [0, -64],
    yRange: [0, 18],
    rotateRange: [12, -18],
    opacityRange: [0.52, 0.84],
  },
];
