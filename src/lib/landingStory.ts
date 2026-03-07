export type LandingDemoVariant = 'signal' | 'blueprint' | 'lanes' | 'community';
export type LandingBackgroundGlyphShape = 'circle' | 'diamond' | 'capsule' | 'ring' | 'spark';

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
    id: 'glyph-circle-northwest',
    shape: 'circle',
    left: '18%',
    top: '5%',
    size: 54,
    mobileSize: 0,
    depth: 'far',
    toneClassName: 'bg-amber-100/56',
    desktopOnly: true,
    xRange: [0, 34],
    yRange: [0, 8],
    scaleRange: [0.94, 1.08],
    opacityRange: [0.24, 0.4],
  },
  {
    id: 'glyph-spark-northwest',
    shape: 'spark',
    left: '2%',
    top: '8%',
    size: 52,
    mobileSize: 28,
    depth: 'far',
    toneClassName: 'text-orange-400/72',
    xRange: [0, 38],
    yRange: [0, -10],
    rotateRange: [-14, 18],
    opacityRange: [0.42, 0.76],
  },
  {
    id: 'glyph-diamond-west',
    shape: 'diamond',
    left: '10%',
    top: '80%',
    size: 82,
    mobileSize: 40,
    depth: 'mid',
    toneClassName: 'bg-orange-300/66 shadow-[0_0_48px_rgba(245,158,11,0.26)]',
    xRange: [0, 54],
    yRange: [0, -28],
    rotateRange: [22, -28],
    scaleRange: [0.94, 1.1],
    opacityRange: [0.34, 0.62],
  },
  {
    id: 'glyph-capsule-top',
    shape: 'capsule',
    left: '44%',
    top: '4%',
    size: 212,
    mobileSize: 92,
    depth: 'far',
    toneClassName: 'bg-amber-200/72 shadow-[0_0_64px_rgba(252,211,77,0.2)]',
    xRange: [0, 132],
    yRange: [0, 10],
    rotateRange: [-12, 12],
    opacityRange: [0.28, 0.48],
  },
  {
    id: 'glyph-circle-east',
    shape: 'circle',
    left: '90%',
    top: '10%',
    size: 120,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'bg-primary/34 shadow-[0_0_44px_rgba(168,85,247,0.14)]',
    desktopOnly: true,
    xRange: [0, -76],
    yRange: [0, 20],
    rotateRange: [0, 0],
    scaleRange: [0.94, 1.16],
    opacityRange: [0.24, 0.46],
  },
  {
    id: 'glyph-spark-device',
    shape: 'spark',
    left: '82%',
    top: '72%',
    size: 60,
    mobileSize: 28,
    depth: 'near',
    toneClassName: 'text-primary/72',
    xRange: [0, -42],
    yRange: [0, 16],
    rotateRange: [20, -22],
    opacityRange: [0.4, 0.7],
  },
  {
    id: 'glyph-diamond-east',
    shape: 'diamond',
    left: '92%',
    top: '42%',
    size: 58,
    mobileSize: 0,
    depth: 'far',
    toneClassName: 'bg-primary/24 shadow-[0_0_30px_rgba(166,134,255,0.12)]',
    desktopOnly: true,
    xRange: [0, -52],
    yRange: [0, -18],
    rotateRange: [18, -18],
    scaleRange: [0.92, 1.1],
    opacityRange: [0.24, 0.38],
  },
  {
    id: 'glyph-capsule-right',
    shape: 'capsule',
    left: '94%',
    top: '48%',
    size: 132,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'bg-orange-100/58',
    desktopOnly: true,
    xRange: [0, -54],
    yRange: [0, 54],
    rotateRange: [14, -16],
    opacityRange: [0.26, 0.42],
  },
  {
    id: 'glyph-circle-southwest',
    shape: 'circle',
    left: '18%',
    top: '84%',
    size: 58,
    mobileSize: 30,
    depth: 'far',
    toneClassName: 'bg-amber-50/82 shadow-[0_0_34px_rgba(255,255,255,0.48)]',
    xRange: [0, 28],
    yRange: [0, -20],
    scaleRange: [0.9, 1.06],
    opacityRange: [0.22, 0.36],
  },
];
