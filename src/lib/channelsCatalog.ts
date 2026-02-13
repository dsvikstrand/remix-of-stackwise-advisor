export interface ChannelCatalogEntry {
  slug: string;
  name: string;
  description: string;
  status: 'active' | 'paused';
  tagSlug: string;
  isJoinEnabled: boolean;
  aliases: string[];
  icon: string;
  priority: number;
}

export const CHANNELS_CATALOG: ChannelCatalogEntry[] = [
  {
    slug: 'general',
    name: 'General Blueprints',
    description: 'Fallback lane for public blueprints that are not mapped to a curated channel yet.',
    status: 'active',
    tagSlug: 'general',
    isJoinEnabled: false,
    aliases: ['other', 'misc', 'unlabeled'],
    icon: 'globe',
    priority: 999,
  },
  {
    slug: 'fitness-training',
    name: 'Fitness Training',
    description: 'Structured exercise plans for strength, cardio, and conditioning.',
    status: 'active',
    tagSlug: 'fitness-training',
    isJoinEnabled: true,
    aliases: ['strength-training', 'hypertrophy', 'bodybuilding', 'workout'],
    icon: 'dumbbell',
    priority: 10,
  },
  {
    slug: 'nutrition-meal-planning',
    name: 'Nutrition and Meal Planning',
    description: 'Practical meal systems for health and consistency.',
    status: 'active',
    tagSlug: 'nutrition-meal-planning',
    isJoinEnabled: true,
    aliases: ['nutrition', 'meal-prep', 'healthy-diet', 'protein', 'shake'],
    icon: 'utensils',
    priority: 20,
  },
  {
    slug: 'sleep-recovery',
    name: 'Sleep and Recovery',
    description: 'Protocols that improve sleep quality and recovery habits.',
    status: 'active',
    tagSlug: 'sleep-recovery',
    isJoinEnabled: true,
    aliases: ['sleep', 'circadian', 'recovery', 'evening-routine'],
    icon: 'moon',
    priority: 30,
  },
  {
    slug: 'mindfulness-mental-wellness',
    name: 'Mindfulness and Mental Wellness',
    description: 'Mental reset and stress management routines.',
    status: 'active',
    tagSlug: 'mindfulness-mental-wellness',
    isJoinEnabled: true,
    aliases: ['mindfulness', 'mental-wellness', 'stress-management', 'meditation'],
    icon: 'brain',
    priority: 40,
  },
  {
    slug: 'skincare-personal-care',
    name: 'Skincare and Personal Care',
    description: 'Repeatable self-care routines for skin and grooming.',
    status: 'active',
    tagSlug: 'skincare-personal-care',
    isJoinEnabled: true,
    aliases: ['skincare', 'hydration', 'grooming', 'self-care'],
    icon: 'sparkles',
    priority: 50,
  },
  {
    slug: 'cooking-home-kitchen',
    name: 'Cooking and Home Kitchen',
    description: 'Repeatable kitchen workflows and recipe systems.',
    status: 'active',
    tagSlug: 'cooking-home-kitchen',
    isJoinEnabled: true,
    aliases: ['cooking', 'recipe', 'kitchen', 'meal-assembly', 'pasta-dishes'],
    icon: 'chef-hat',
    priority: 60,
  },
  {
    slug: 'biohacking-supplements',
    name: 'Biohacking and Supplements',
    description: 'Habit-oriented protocols around supplements and optimization.',
    status: 'active',
    tagSlug: 'biohacking-supplements',
    isJoinEnabled: true,
    aliases: ['biohacking', 'nootropics', 'longevity', 'supplements'],
    icon: 'flask-conical',
    priority: 70,
  },
  {
    slug: 'productivity-systems',
    name: 'Productivity Systems',
    description: 'Planning and execution workflows for getting work done.',
    status: 'active',
    tagSlug: 'productivity-systems',
    isJoinEnabled: true,
    aliases: ['productivity', 'planning', 'routine', 'focus'],
    icon: 'check-check',
    priority: 80,
  },
  {
    slug: 'study-learning-systems',
    name: 'Study and Learning Systems',
    description: 'Methods for learning, revision, and retention.',
    status: 'active',
    tagSlug: 'study-learning-systems',
    isJoinEnabled: true,
    aliases: ['studying', 'note-taking', 'memory', 'spaced-repetition'],
    icon: 'graduation-cap',
    priority: 90,
  },
  {
    slug: 'writing-content-creation',
    name: 'Writing and Content Creation',
    description: 'Systems for drafting, publishing, and content cadence.',
    status: 'active',
    tagSlug: 'writing-content-creation',
    isJoinEnabled: true,
    aliases: ['writing', 'content-creation', 'publishing', 'copywriting'],
    icon: 'pen-square',
    priority: 100,
  },
  {
    slug: 'creator-growth-marketing',
    name: 'Creator Growth and Marketing',
    description: 'Audience growth and distribution playbooks.',
    status: 'active',
    tagSlug: 'creator-growth-marketing',
    isJoinEnabled: true,
    aliases: ['marketing', 'seo', 'audience-growth', 'social-media'],
    icon: 'megaphone',
    priority: 110,
  },
  {
    slug: 'business-ops-freelance',
    name: 'Business Ops and Freelance',
    description: 'Lightweight operating systems for solo operators.',
    status: 'active',
    tagSlug: 'business-ops-freelance',
    isJoinEnabled: true,
    aliases: ['freelance', 'consulting', 'operations', 'pricing'],
    icon: 'briefcase-business',
    priority: 120,
  },
  {
    slug: 'career-job-search',
    name: 'Career and Job Search',
    description: 'Structured workflows for finding and landing roles.',
    status: 'active',
    tagSlug: 'career-job-search',
    isJoinEnabled: true,
    aliases: ['job-search', 'resume', 'interview', 'networking'],
    icon: 'search-check',
    priority: 130,
  },
  {
    slug: 'personal-finance-budgeting',
    name: 'Personal Finance and Budgeting',
    description: 'Everyday money management routines and templates.',
    status: 'active',
    tagSlug: 'personal-finance-budgeting',
    isJoinEnabled: true,
    aliases: ['budgeting', 'savings', 'debt-payoff', 'personal-finance'],
    icon: 'wallet',
    priority: 140,
  },
  {
    slug: 'investing-basics',
    name: 'Investing Basics',
    description: 'Intro-level investing routines and frameworks.',
    status: 'active',
    tagSlug: 'investing-basics',
    isJoinEnabled: true,
    aliases: ['investing', 'index-funds', 'portfolio-basics'],
    icon: 'line-chart',
    priority: 150,
  },
  {
    slug: 'home-organization-cleaning',
    name: 'Home Organization and Cleaning',
    description: 'Systems for maintaining spaces with low friction.',
    status: 'active',
    tagSlug: 'home-organization-cleaning',
    isJoinEnabled: true,
    aliases: ['organization', 'declutter', 'home-maintenance', 'cleaning'],
    icon: 'house',
    priority: 160,
  },
  {
    slug: 'parenting-family-routines',
    name: 'Parenting and Family Routines',
    description: 'Family-oriented routines for daily coordination.',
    status: 'active',
    tagSlug: 'parenting-family-routines',
    isJoinEnabled: true,
    aliases: ['parenting', 'family-routine', 'kids-activities'],
    icon: 'baby',
    priority: 170,
  },
  {
    slug: 'travel-planning',
    name: 'Travel Planning',
    description: 'Repeatable travel prep and trip-execution workflows.',
    status: 'active',
    tagSlug: 'travel-planning',
    isJoinEnabled: true,
    aliases: ['travel', 'itinerary', 'packing', 'trip-prep'],
    icon: 'plane',
    priority: 180,
  },
  {
    slug: 'developer-workflows',
    name: 'Developer Workflows',
    description: 'Coding productivity and engineering workflow routines.',
    status: 'active',
    tagSlug: 'developer-workflows',
    isJoinEnabled: true,
    aliases: ['coding', 'developer-tools', 'git', 'testing'],
    icon: 'code',
    priority: 190,
  },
  {
    slug: 'ai-tools-automation',
    name: 'AI Tools and Automation',
    description: 'Practical usage patterns for AI tools and automations.',
    status: 'active',
    tagSlug: 'ai-tools-automation',
    isJoinEnabled: true,
    aliases: ['ai-tools', 'automation', 'llm', 'prompts'],
    icon: 'bot',
    priority: 200,
  },
];

export function getChannelBySlug(slug: string) {
  return CHANNELS_CATALOG.find((channel) => channel.slug === slug) || null;
}

export function isCuratedChannelSlug(slug: string) {
  return CHANNELS_CATALOG.some((channel) => channel.slug === slug);
}

export function resolveChannelTagSlug(slug: string) {
  const channel = getChannelBySlug(slug);
  return channel?.tagSlug || null;
}

export function getChannelByTagSlug(tagSlug: string) {
  return CHANNELS_CATALOG.find((channel) => channel.tagSlug === tagSlug) || null;
}
