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
    id: 'glyph-spark-northwest',
    shape: 'spark',
    left: '4%',
    top: '10%',
    size: 42,
    mobileSize: 30,
    depth: 'far',
    toneClassName: 'text-orange-400/58',
    xRange: [-54, 72],
    yRange: [24, -28],
    rotateRange: [-20, 24],
    opacityRange: [0.3, 0.6],
  },
  {
    id: 'glyph-diamond-west',
    shape: 'diamond',
    left: '13%',
    top: '72%',
    size: 72,
    mobileSize: 42,
    depth: 'mid',
    toneClassName: 'bg-orange-200/42 shadow-[0_0_40px_rgba(245,158,11,0.18)]',
    xRange: [-48, 36],
    yRange: [42, -34],
    rotateRange: [22, -30],
    scaleRange: [0.94, 1.08],
    opacityRange: [0.22, 0.5],
  },
  {
    id: 'glyph-capsule-top',
    shape: 'capsule',
    left: '26%',
    top: '8%',
    size: 148,
    mobileSize: 94,
    depth: 'far',
    toneClassName: 'bg-amber-200/34',
    xRange: [-64, 54],
    yRange: [-6, 20],
    rotateRange: [-14, 16],
    opacityRange: [0.16, 0.34],
  },
  {
    id: 'glyph-circle-east',
    shape: 'circle',
    left: '86%',
    top: '14%',
    size: 92,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'bg-primary/16',
    desktopOnly: true,
    xRange: [62, -56],
    yRange: [-18, 34],
    rotateRange: [0, 0],
    scaleRange: [0.96, 1.14],
    opacityRange: [0.18, 0.42],
  },
  {
    id: 'glyph-spark-device',
    shape: 'spark',
    left: '78%',
    top: '56%',
    size: 48,
    mobileSize: 30,
    depth: 'near',
    toneClassName: 'text-primary/58',
    xRange: [40, -44],
    yRange: [-30, 28],
    rotateRange: [22, -24],
    opacityRange: [0.26, 0.56],
  },
  {
    id: 'glyph-diamond-east',
    shape: 'diamond',
    left: '90%',
    top: '66%',
    size: 58,
    mobileSize: 0,
    depth: 'far',
    toneClassName: 'bg-primary/24',
    desktopOnly: true,
    xRange: [34, -42],
    yRange: [32, -18],
    rotateRange: [18, -18],
    scaleRange: [0.92, 1.1],
    opacityRange: [0.14, 0.32],
  },
  {
    id: 'glyph-capsule-right',
    shape: 'capsule',
    left: '64%',
    top: '24%',
    size: 126,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'bg-orange-100/36',
    desktopOnly: true,
    xRange: [52, -46],
    yRange: [-12, 28],
    rotateRange: [10, -14],
    opacityRange: [0.18, 0.34],
  },
];
