export type LandingDemoVariant = 'signal' | 'blueprint' | 'lanes' | 'community';
export type LandingBackgroundGlyphShape = 'circle';

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
    id: 'glyph-circle-top-long-a',
    shape: 'circle',
    left: '6%',
    top: '7%',
    size: 132,
    mobileSize: 60,
    depth: 'far',
    toneClassName: 'bg-orange-300/92 shadow-[0_0_80px_rgba(251,146,60,0.42)]',
    desktopPath: 'M 6 10 C 20 2, 38 12, 56 8 C 70 6, 82 9, 94 14',
    mobilePath: 'M 8 10 C 16 6, 26 12, 38 9 C 48 7, 58 9, 68 13',
    startProgress: 0.04,
    endProgress: 0.96,
    startScale: 0.94,
    endScale: 1.08,
    startOpacity: 0.6,
    endOpacity: 0.88,
  },
  {
    id: 'glyph-circle-top-long-b',
    shape: 'circle',
    left: '90%',
    top: '18%',
    size: 108,
    mobileSize: 48,
    depth: 'far',
    toneClassName: 'bg-amber-200/94 shadow-[0_0_82px_rgba(252,211,77,0.36)]',
    desktopPath: 'M 94 22 C 78 14, 58 24, 40 18 C 28 15, 18 18, 7 22',
    mobilePath: 'M 88 22 C 74 16, 58 22, 42 18 C 30 16, 20 18, 10 21',
    startProgress: 0.04,
    endProgress: 0.96,
    startScale: 0.92,
    endScale: 1.1,
    startOpacity: 0.54,
    endOpacity: 0.82,
  },
  {
    id: 'glyph-circle-bottom-medium-a',
    shape: 'circle',
    left: '5%',
    top: '78%',
    size: 92,
    mobileSize: 44,
    depth: 'mid',
    toneClassName: 'bg-primary/78 shadow-[0_0_66px_rgba(168,85,247,0.32)]',
    desktopPath: 'M 4 78 C 14 84, 28 80, 40 74 C 48 70, 56 70, 64 73',
    mobilePath: 'M 6 80 C 14 84, 24 80, 34 76 C 42 73, 50 73, 58 76',
    startProgress: 0.06,
    endProgress: 0.78,
    startScale: 0.96,
    endScale: 1.1,
    startOpacity: 0.58,
    endOpacity: 0.8,
  },
  {
    id: 'glyph-circle-bottom-medium-b',
    shape: 'circle',
    left: '92%',
    top: '76%',
    size: 108,
    mobileSize: 50,
    depth: 'mid',
    toneClassName: 'bg-rose-200/90 shadow-[0_0_62px_rgba(251,113,133,0.32)]',
    desktopPath: 'M 94 78 C 92 68, 86 60, 78 56 C 72 53, 66 54, 60 60',
    mobilePath: 'M 90 80 C 88 70, 82 64, 74 60 C 68 57, 62 58, 56 63',
    startProgress: 0.05,
    endProgress: 0.76,
    startScale: 0.94,
    endScale: 1.08,
    startOpacity: 0.5,
    endOpacity: 0.76,
  },
  {
    id: 'glyph-circle-left-short',
    shape: 'circle',
    left: '1.5%',
    top: '18%',
    size: 58,
    mobileSize: 30,
    depth: 'far',
    toneClassName: 'bg-sky-200/84 shadow-[0_0_40px_rgba(125,211,252,0.26)]',
    desktopPath: 'M 3 20 C 5 16, 9 14, 15 17 C 13 22, 10 26, 5 25',
    mobilePath: 'M 4 22 C 6 18, 9 16, 14 18 C 12 22, 9 25, 5 24',
    startProgress: 0.12,
    endProgress: 0.38,
    startScale: 0.98,
    endScale: 1.04,
    startOpacity: 0.46,
    endOpacity: 0.68,
  },
];
