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
    id: 'glyph-spark-west',
    shape: 'spark',
    left: '7%',
    top: '18%',
    size: 30,
    mobileSize: 22,
    depth: 'far',
    toneClassName: 'text-primary/28',
    xRange: [-18, 34],
    yRange: [12, -18],
    rotateRange: [-12, 18],
    opacityRange: [0.18, 0.42],
  },
  {
    id: 'glyph-diamond-south',
    shape: 'diamond',
    left: '18%',
    top: '76%',
    size: 44,
    mobileSize: 30,
    depth: 'mid',
    toneClassName: 'border border-orange-300/35 bg-orange-100/25',
    xRange: [-26, 18],
    yRange: [28, -20],
    rotateRange: [18, -26],
    scaleRange: [0.92, 1.06],
    opacityRange: [0.16, 0.4],
  },
  {
    id: 'glyph-capsule-copy',
    shape: 'capsule',
    left: '32%',
    top: '13%',
    size: 120,
    mobileSize: 86,
    depth: 'far',
    toneClassName: 'bg-amber-200/26',
    xRange: [-30, 24],
    yRange: [0, 12],
    rotateRange: [-8, 10],
    opacityRange: [0.12, 0.32],
  },
  {
    id: 'glyph-ring-east',
    shape: 'ring',
    left: '82%',
    top: '20%',
    size: 58,
    mobileSize: 0,
    depth: 'mid',
    toneClassName: 'border-2 border-primary/24',
    desktopOnly: true,
    xRange: [22, -26],
    yRange: [-10, 22],
    rotateRange: [0, 28],
    scaleRange: [0.95, 1.08],
    opacityRange: [0.18, 0.38],
  },
  {
    id: 'glyph-spark-device',
    shape: 'spark',
    left: '72%',
    top: '58%',
    size: 38,
    mobileSize: 24,
    depth: 'near',
    toneClassName: 'text-orange-300/36',
    xRange: [18, -20],
    yRange: [-18, 16],
    rotateRange: [14, -18],
    opacityRange: [0.2, 0.46],
  },
  {
    id: 'glyph-circle-east',
    shape: 'circle',
    left: '89%',
    top: '72%',
    size: 64,
    mobileSize: 34,
    depth: 'far',
    toneClassName: 'bg-primary/16',
    xRange: [-18, 12],
    yRange: [22, -16],
    scaleRange: [0.9, 1.08],
    opacityRange: [0.14, 0.34],
  },
  {
    id: 'glyph-capsule-top',
    shape: 'capsule',
    left: '58%',
    top: '8%',
    size: 112,
    mobileSize: 74,
    depth: 'mid',
    toneClassName: 'bg-orange-200/22',
    xRange: [30, -14],
    yRange: [-8, 18],
    rotateRange: [6, -10],
    opacityRange: [0.16, 0.28],
  },
];
