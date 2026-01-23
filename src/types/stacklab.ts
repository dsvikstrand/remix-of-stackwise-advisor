// StackLab Data Types
// Designed for LocalStorage V1, ready for Supabase migration

export type SupplementCategory = 
  | 'sleep-recovery'
  | 'amino-performance'
  | 'nootropics-focus'
  | 'energy-stimulants'
  | 'stress-mood'
  | 'foundations';

export interface InventoryItem {
  id: string;
  name: string;
  category: SupplementCategory;
  isCustom: boolean;
}

export type DoseStrength = 'low' | 'medium' | 'high';
export type FrequencyUnit = 'day' | 'week';
export type CaffeineTolerance = 'none' | 'low' | 'medium' | 'high';
export type SleepSensitivity = 'low' | 'medium' | 'high';

export interface SafetyFlags {
  takesMedications: boolean;
  caffeineTolerance: CaffeineTolerance;
  sleepSensitivity: SleepSensitivity;
  pregnantOrBreastfeeding: boolean;
  bloodPressureConcerns: boolean;
  anxietySensitivity: boolean;
}

export interface Settings {
  doseStrength: DoseStrength;
  frequencyN: number;
  frequencyUnit: FrequencyUnit;
  safetyFlags: SafetyFlags;
}

export interface Goal {
  id: string;
  label: string;
  isCustom: boolean;
}

export interface Recommendation {
  id: string;
  rawMarkdown: string;
  createdAt: string;
  inputsSnapshot: {
    inventory: InventoryItem[];
    goals: Goal[];
    settings: Settings;
  };
}

export interface StackLabState {
  inventory: InventoryItem[];
  selectedGoals: Goal[];
  customGoals: Goal[];
  settings: Settings;
  recommendations: Recommendation[];
}

// Preset Goals
export const PRESET_GOALS: Omit<Goal, 'isCustom'>[] = [
  { id: 'sleep-quality', label: 'Sleep quality' },
  { id: 'fall-asleep-faster', label: 'Fall asleep faster' },
  { id: 'reduce-night-awakenings', label: 'Reduce night awakenings' },
  { id: 'morning-energy', label: 'Morning energy' },
  { id: 'calm-anxiety-reduction', label: 'Calm / anxiety reduction' },
  { id: 'focus', label: 'Focus' },
  { id: 'mental-clarity', label: 'Mental clarity' },
  { id: 'mood', label: 'Mood' },
  { id: 'workout-performance', label: 'Workout performance' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'muscle-recovery', label: 'Muscle recovery' },
];

// Supplement Catalog
export const SUPPLEMENT_CATALOG: Record<SupplementCategory, Omit<InventoryItem, 'isCustom'>[]> = {
  'sleep-recovery': [
    { id: 'magnesium-glycinate', name: 'Magnesium glycinate', category: 'sleep-recovery' },
    { id: 'glycine', name: 'Glycine', category: 'sleep-recovery' },
    { id: 'l-theanine-sleep', name: 'L-theanine', category: 'sleep-recovery' },
    { id: 'apigenin', name: 'Apigenin', category: 'sleep-recovery' },
    { id: 'melatonin', name: 'Melatonin', category: 'sleep-recovery' },
    { id: 'taurine', name: 'Taurine', category: 'sleep-recovery' },
    { id: 'ashwagandha-sleep', name: 'Ashwagandha', category: 'sleep-recovery' },
    { id: 'chamomile-extract', name: 'Chamomile extract', category: 'sleep-recovery' },
    { id: 'gaba', name: 'GABA', category: 'sleep-recovery' },
    { id: 'l-tryptophan', name: 'L-tryptophan', category: 'sleep-recovery' },
    { id: 'valerian-root', name: 'Valerian root', category: 'sleep-recovery' },
    { id: 'passionflower', name: 'Passionflower', category: 'sleep-recovery' },
    { id: 'magnolia-bark', name: 'Magnolia bark', category: 'sleep-recovery' },
    { id: 'reishi-mushroom', name: 'Reishi mushroom', category: 'sleep-recovery' },
    { id: 'lavender-extract', name: 'Lavender extract', category: 'sleep-recovery' },
    { id: 'phosphatidylserine', name: 'Phosphatidylserine', category: 'sleep-recovery' },
    { id: '5-htp', name: '5-HTP', category: 'sleep-recovery' },
    { id: 'cbd-oil', name: 'CBD oil', category: 'sleep-recovery' },
  ],
  'amino-performance': [
    { id: 'creatine-monohydrate', name: 'Creatine monohydrate', category: 'amino-performance' },
    { id: 'beta-alanine', name: 'Beta-alanine', category: 'amino-performance' },
    { id: 'citrulline-malate', name: 'Citrulline malate', category: 'amino-performance' },
    { id: 'l-tyrosine', name: 'L-tyrosine', category: 'amino-performance' },
    { id: 'bcaas', name: 'BCAAs', category: 'amino-performance' },
    { id: 'eaas', name: 'EAAs', category: 'amino-performance' },
    { id: 'l-carnitine', name: 'L-carnitine', category: 'amino-performance' },
    { id: 'sodium-bicarbonate', name: 'Sodium bicarbonate', category: 'amino-performance' },
    { id: 'l-glutamine', name: 'L-glutamine', category: 'amino-performance' },
    { id: 'hmb', name: 'HMB', category: 'amino-performance' },
    { id: 'taurine-perf', name: 'Taurine', category: 'amino-performance' },
    { id: 'arginine', name: 'L-arginine', category: 'amino-performance' },
    { id: 'ornithine', name: 'L-ornithine', category: 'amino-performance' },
    { id: 'agmatine', name: 'Agmatine sulfate', category: 'amino-performance' },
    { id: 'betaine-tmg', name: 'Betaine (TMG)', category: 'amino-performance' },
    { id: 'glycine-perf', name: 'Glycine', category: 'amino-performance' },
    { id: 'collagen-peptides', name: 'Collagen peptides', category: 'amino-performance' },
    { id: 'whey-protein', name: 'Whey protein', category: 'amino-performance' },
    { id: 'casein-protein', name: 'Casein protein', category: 'amino-performance' },
  ],
  'nootropics-focus': [
    { id: 'lions-mane', name: "Lion's mane", category: 'nootropics-focus' },
    { id: 'rhodiola-rosea', name: 'Rhodiola rosea', category: 'nootropics-focus' },
    { id: 'bacopa-monnieri', name: 'Bacopa monnieri', category: 'nootropics-focus' },
    { id: 'alpha-gpc', name: 'Alpha-GPC', category: 'nootropics-focus' },
    { id: 'cdp-choline', name: 'CDP-choline', category: 'nootropics-focus' },
    { id: 'panax-ginseng', name: 'Panax ginseng', category: 'nootropics-focus' },
    { id: 'ginkgo-biloba', name: 'Ginkgo biloba', category: 'nootropics-focus' },
    { id: 'phosphatidylserine-noot', name: 'Phosphatidylserine', category: 'nootropics-focus' },
    { id: 'uridine', name: 'Uridine', category: 'nootropics-focus' },
    { id: 'acetyl-l-carnitine', name: 'Acetyl-L-carnitine', category: 'nootropics-focus' },
    { id: 'nac', name: 'NAC (N-Acetyl Cysteine)', category: 'nootropics-focus' },
    { id: 'noopept', name: 'Noopept', category: 'nootropics-focus' },
    { id: 'aniracetam', name: 'Aniracetam', category: 'nootropics-focus' },
    { id: 'piracetam', name: 'Piracetam', category: 'nootropics-focus' },
    { id: 'modafinil', name: 'Modafinil', category: 'nootropics-focus' },
    { id: 'huperzine-a', name: 'Huperzine A', category: 'nootropics-focus' },
    { id: 'dmae', name: 'DMAE', category: 'nootropics-focus' },
    { id: 'pterostilbene', name: 'Pterostilbene', category: 'nootropics-focus' },
  ],
  'energy-stimulants': [
    { id: 'caffeine', name: 'Caffeine', category: 'energy-stimulants' },
    { id: 'l-theanine-energy', name: 'L-theanine', category: 'energy-stimulants' },
    { id: 'green-tea-extract', name: 'Green tea extract', category: 'energy-stimulants' },
    { id: 'yerba-mate', name: 'Yerba mate', category: 'energy-stimulants' },
    { id: 'cordyceps', name: 'Cordyceps', category: 'energy-stimulants' },
    { id: 'b-vitamins', name: 'B vitamins (complex)', category: 'energy-stimulants' },
    { id: 'coq10', name: 'CoQ10', category: 'energy-stimulants' },
    { id: 'alcar', name: 'Acetyl-L-carnitine (ALCAR)', category: 'energy-stimulants' },
    { id: 'pqq', name: 'PQQ', category: 'energy-stimulants' },
    { id: 'ribose', name: 'D-Ribose', category: 'energy-stimulants' },
    { id: 'guarana', name: 'Guarana', category: 'energy-stimulants' },
    { id: 'maca-root', name: 'Maca root', category: 'energy-stimulants' },
    { id: 'eleuthero', name: 'Eleuthero (Siberian ginseng)', category: 'energy-stimulants' },
    { id: 'shilajit', name: 'Shilajit', category: 'energy-stimulants' },
    { id: 'nadh', name: 'NADH', category: 'energy-stimulants' },
    { id: 'tyrosine-energy', name: 'L-tyrosine', category: 'energy-stimulants' },
    { id: 'dynamine', name: 'Dynamine', category: 'energy-stimulants' },
    { id: 'theacrine', name: 'Theacrine', category: 'energy-stimulants' },
  ],
  'stress-mood': [
    { id: 'ashwagandha-stress', name: 'Ashwagandha', category: 'stress-mood' },
    { id: 'l-theanine-stress', name: 'L-theanine', category: 'stress-mood' },
    { id: 'magnesium-stress', name: 'Magnesium', category: 'stress-mood' },
    { id: 'saffron-extract', name: 'Saffron extract', category: 'stress-mood' },
    { id: 'omega-3-mood', name: 'Omega-3 (EPA/DHA)', category: 'stress-mood' },
    { id: 'vitamin-d3-mood', name: 'Vitamin D3', category: 'stress-mood' },
    { id: 'inositol', name: 'Inositol', category: 'stress-mood' },
    { id: 'lemon-balm', name: 'Lemon balm', category: 'stress-mood' },
    { id: 'holy-basil', name: 'Holy basil (Tulsi)', category: 'stress-mood' },
    { id: 'kava', name: 'Kava', category: 'stress-mood' },
    { id: 'st-johns-wort', name: "St. John's wort", category: 'stress-mood' },
    { id: 'sam-e', name: 'SAM-e', category: 'stress-mood' },
    { id: 'lithium-orotate', name: 'Lithium orotate', category: 'stress-mood' },
    { id: 'b6-p5p', name: 'Vitamin B6 (P-5-P)', category: 'stress-mood' },
    { id: 'mucuna-pruriens', name: 'Mucuna pruriens', category: 'stress-mood' },
    { id: 'gotu-kola', name: 'Gotu kola', category: 'stress-mood' },
    { id: 'skullcap', name: 'Skullcap', category: 'stress-mood' },
    { id: 'relora', name: 'Relora', category: 'stress-mood' },
  ],
  'foundations': [
    { id: 'omega-3', name: 'Omega-3 (EPA/DHA)', category: 'foundations' },
    { id: 'vitamin-d3', name: 'Vitamin D3', category: 'foundations' },
    { id: 'vitamin-k2', name: 'Vitamin K2', category: 'foundations' },
    { id: 'multivitamin', name: 'Multivitamin', category: 'foundations' },
    { id: 'electrolytes', name: 'Electrolytes', category: 'foundations' },
    { id: 'fiber-psyllium', name: 'Fiber (psyllium)', category: 'foundations' },
    { id: 'probiotic', name: 'Probiotic', category: 'foundations' },
    { id: 'zinc', name: 'Zinc', category: 'foundations' },
    { id: 'magnesium-citrate', name: 'Magnesium citrate', category: 'foundations' },
    { id: 'vitamin-c', name: 'Vitamin C', category: 'foundations' },
    { id: 'vitamin-a', name: 'Vitamin A', category: 'foundations' },
    { id: 'vitamin-e', name: 'Vitamin E', category: 'foundations' },
    { id: 'iron', name: 'Iron', category: 'foundations' },
    { id: 'selenium', name: 'Selenium', category: 'foundations' },
    { id: 'iodine', name: 'Iodine', category: 'foundations' },
    { id: 'copper', name: 'Copper', category: 'foundations' },
    { id: 'boron', name: 'Boron', category: 'foundations' },
    { id: 'digestive-enzymes', name: 'Digestive enzymes', category: 'foundations' },
    { id: 'cod-liver-oil', name: 'Cod liver oil', category: 'foundations' },
    { id: 'quercetin', name: 'Quercetin', category: 'foundations' },
  ],
};

export const CATEGORY_LABELS: Record<SupplementCategory, string> = {
  'sleep-recovery': 'Sleep & Recovery',
  'amino-performance': 'Aminos & Performance',
  'nootropics-focus': 'Nootropics & Focus',
  'energy-stimulants': 'Energy & Stimulants',
  'stress-mood': 'Stress & Mood',
  'foundations': 'Foundations',
};

export const DEFAULT_SETTINGS: Settings = {
  doseStrength: 'medium',
  frequencyN: 3,
  frequencyUnit: 'day',
  safetyFlags: {
    takesMedications: false,
    caffeineTolerance: 'medium',
    sleepSensitivity: 'medium',
    pregnantOrBreastfeeding: false,
    bloodPressureConcerns: false,
    anxietySensitivity: false,
  },
};

export const DEFAULT_STATE: StackLabState = {
  inventory: [],
  selectedGoals: [],
  customGoals: [],
  settings: DEFAULT_SETTINGS,
  recommendations: [],
};

// Blend Builder Types
export type DoseUnit = 'mg' | 'g' | 'mcg' | 'IU' | 'ml' | 'scoop';

export interface BlendItem {
  id: string;
  supplementId: string;
  name: string;
  category: SupplementCategory;
  amount: number;
  unit: DoseUnit;
}

export interface BlendAnalysis {
  classification: string;
  score: number;
  summary: string;
  timing: string;
  tweaks: string[];
  warnings: string[];
  rawMarkdown: string;
}

export interface BlendRecipe {
  id: string;
  name: string;
  items: BlendItem[];
  createdAt: string;
  analysis?: BlendAnalysis;
}

export interface BlendState {
  currentBlend: BlendRecipe | null;
  history: BlendRecipe[];
}

export const DEFAULT_BLEND_STATE: BlendState = {
  currentBlend: null,
  history: [],
};

// Default doses by category for quick presets
export const DEFAULT_DOSES: Record<string, { amount: number; unit: DoseUnit }> = {
  'magnesium-glycinate': { amount: 400, unit: 'mg' },
  'glycine': { amount: 3, unit: 'g' },
  'l-theanine-sleep': { amount: 200, unit: 'mg' },
  'apigenin': { amount: 50, unit: 'mg' },
  'melatonin': { amount: 0.5, unit: 'mg' },
  'creatine-monohydrate': { amount: 5, unit: 'g' },
  'beta-alanine': { amount: 3, unit: 'g' },
  'citrulline-malate': { amount: 6, unit: 'g' },
  'caffeine': { amount: 100, unit: 'mg' },
  'vitamin-d3': { amount: 5000, unit: 'IU' },
  'omega-3': { amount: 2, unit: 'g' },
};

// ============================================
// PROTEIN SHAKE BUILDER TYPES
// ============================================

export type ProteinCategory = 
  | 'whey-casein'
  | 'plant-based'
  | 'specialty'
  | 'boosters';

export interface ProteinSource {
  id: string;
  name: string;
  category: ProteinCategory;
  proteinPerServing: number;
  servingSize: string;
  aminoHighlights?: string[];
}

export interface ShakeItem {
  id: string;
  proteinId: string;
  name: string;
  category: ProteinCategory;
  scoops: number;
  gramsProtein: number;
}

export interface ProteinAnalysis {
  completenessScore: number;
  absorptionProfile: string;
  timing: string;
  optimizations: string[];
  warnings: string[];
  rawMarkdown: string;
}

export interface ShakeRecipe {
  id: string;
  name: string;
  items: ShakeItem[];
  totalProtein: number;
  createdAt: string;
  analysis?: ProteinAnalysis;
}

export interface ProteinState {
  currentShake: ShakeRecipe | null;
  history: ShakeRecipe[];
}

export const DEFAULT_PROTEIN_STATE: ProteinState = {
  currentShake: null,
  history: [],
};

export const PROTEIN_CATEGORY_LABELS: Record<ProteinCategory, string> = {
  'whey-casein': 'Whey & Casein',
  'plant-based': 'Plant-Based',
  'specialty': 'Specialty',
  'boosters': 'Boosters',
};

export const PROTEIN_CATALOG: Record<ProteinCategory, ProteinSource[]> = {
  'whey-casein': [
    { id: 'whey-isolate', name: 'Whey Isolate', category: 'whey-casein', proteinPerServing: 25, servingSize: '1 scoop (30g)', aminoHighlights: ['High Leucine', 'Fast Absorbing'] },
    { id: 'whey-concentrate', name: 'Whey Concentrate', category: 'whey-casein', proteinPerServing: 22, servingSize: '1 scoop (33g)', aminoHighlights: ['Complete EAAs'] },
    { id: 'whey-hydrolysate', name: 'Whey Hydrolysate', category: 'whey-casein', proteinPerServing: 24, servingSize: '1 scoop (30g)', aminoHighlights: ['Pre-Digested', 'Fastest Absorption'] },
    { id: 'casein-micellar', name: 'Micellar Casein', category: 'whey-casein', proteinPerServing: 24, servingSize: '1 scoop (33g)', aminoHighlights: ['Slow Release', 'Anti-Catabolic'] },
    { id: 'casein-hydrolysate', name: 'Casein Hydrolysate', category: 'whey-casein', proteinPerServing: 23, servingSize: '1 scoop (32g)', aminoHighlights: ['Fast Casein'] },
    { id: 'milk-protein-isolate', name: 'Milk Protein Isolate', category: 'whey-casein', proteinPerServing: 26, servingSize: '1 scoop (30g)', aminoHighlights: ['80/20 Casein/Whey'] },
    { id: 'goat-whey', name: 'Goat Whey Protein', category: 'whey-casein', proteinPerServing: 20, servingSize: '1 scoop (28g)', aminoHighlights: ['A2 Protein', 'Easy Digest'] },
    { id: 'grass-fed-whey', name: 'Grass-Fed Whey', category: 'whey-casein', proteinPerServing: 24, servingSize: '1 scoop (31g)', aminoHighlights: ['Higher CLA', 'Omega-3s'] },
    { id: 'native-whey', name: 'Native Whey', category: 'whey-casein', proteinPerServing: 25, servingSize: '1 scoop (30g)', aminoHighlights: ['Undenatured', 'Higher Leucine'] },
  ],
  'plant-based': [
    { id: 'pea-protein', name: 'Pea Protein', category: 'plant-based', proteinPerServing: 21, servingSize: '1 scoop (33g)', aminoHighlights: ['High Arginine', 'High BCAAs'] },
    { id: 'rice-protein', name: 'Brown Rice Protein', category: 'plant-based', proteinPerServing: 22, servingSize: '1 scoop (30g)', aminoHighlights: ['High Cysteine', 'Hypoallergenic'] },
    { id: 'hemp-protein', name: 'Hemp Protein', category: 'plant-based', proteinPerServing: 15, servingSize: '1 scoop (30g)', aminoHighlights: ['Omega-3/6', 'Complete EAAs'] },
    { id: 'soy-isolate', name: 'Soy Protein Isolate', category: 'plant-based', proteinPerServing: 25, servingSize: '1 scoop (28g)', aminoHighlights: ['Complete EAAs', 'High PDCAAS'] },
    { id: 'pumpkin-seed-protein', name: 'Pumpkin Seed Protein', category: 'plant-based', proteinPerServing: 18, servingSize: '1 scoop (30g)', aminoHighlights: ['High Tryptophan', 'Zinc'] },
    { id: 'sacha-inchi', name: 'Sacha Inchi Protein', category: 'plant-based', proteinPerServing: 17, servingSize: '1 scoop (28g)', aminoHighlights: ['Complete EAAs', 'Omega-3s'] },
    { id: 'sunflower-protein', name: 'Sunflower Seed Protein', category: 'plant-based', proteinPerServing: 16, servingSize: '1 scoop (30g)', aminoHighlights: ['Nut-Free', 'High Arginine'] },
    { id: 'pea-rice-blend', name: 'Pea + Rice Blend', category: 'plant-based', proteinPerServing: 24, servingSize: '1 scoop (32g)', aminoHighlights: ['Complete Profile', 'Synergistic'] },
    { id: 'fava-bean-protein', name: 'Fava Bean Protein', category: 'plant-based', proteinPerServing: 21, servingSize: '1 scoop (30g)', aminoHighlights: ['High L-Dopa'] },
    { id: 'watermelon-seed', name: 'Watermelon Seed Protein', category: 'plant-based', proteinPerServing: 19, servingSize: '1 scoop (28g)', aminoHighlights: ['High Arginine'] },
  ],
  'specialty': [
    { id: 'egg-white-protein', name: 'Egg White Protein', category: 'specialty', proteinPerServing: 24, servingSize: '1 scoop (33g)', aminoHighlights: ['Perfect PDCAAS', 'Complete EAAs'] },
    { id: 'whole-egg-protein', name: 'Whole Egg Protein', category: 'specialty', proteinPerServing: 23, servingSize: '1 scoop (35g)', aminoHighlights: ['With Fats', 'Fat-Soluble Vitamins'] },
    { id: 'beef-protein-isolate', name: 'Beef Protein Isolate', category: 'specialty', proteinPerServing: 23, servingSize: '1 scoop (28g)', aminoHighlights: ['High Iron', 'Creatine'] },
    { id: 'collagen-peptides', name: 'Collagen Peptides', category: 'specialty', proteinPerServing: 18, servingSize: '2 scoops (20g)', aminoHighlights: ['High Glycine', 'Proline', 'Skin/Joint'] },
    { id: 'hydrolyzed-collagen', name: 'Hydrolyzed Collagen', category: 'specialty', proteinPerServing: 11, servingSize: '1 scoop (12g)', aminoHighlights: ['Type I & III', 'Fast Absorbing'] },
    { id: 'bone-broth-protein', name: 'Bone Broth Protein', category: 'specialty', proteinPerServing: 20, servingSize: '1 scoop (22g)', aminoHighlights: ['Collagen Rich', 'Gut Health'] },
    { id: 'cricket-protein', name: 'Cricket Protein', category: 'specialty', proteinPerServing: 22, servingSize: '1 scoop (25g)', aminoHighlights: ['B12', 'Iron', 'Sustainable'] },
    { id: 'salmon-protein', name: 'Salmon Protein', category: 'specialty', proteinPerServing: 21, servingSize: '1 scoop (28g)', aminoHighlights: ['Omega-3s', 'Astaxanthin'] },
  ],
  'boosters': [
    { id: 'leucine', name: 'L-Leucine', category: 'boosters', proteinPerServing: 0, servingSize: '2.5g', aminoHighlights: ['MPS Trigger', 'Anabolic Signal'] },
    { id: 'bcaa-211', name: 'BCAA 2:1:1', category: 'boosters', proteinPerServing: 0, servingSize: '5g', aminoHighlights: ['Leu/Iso/Val', 'Anti-Catabolic'] },
    { id: 'eaa-complex', name: 'EAA Complex', category: 'boosters', proteinPerServing: 0, servingSize: '10g', aminoHighlights: ['All 9 EAAs', 'Complete'] },
    { id: 'glutamine', name: 'L-Glutamine', category: 'boosters', proteinPerServing: 0, servingSize: '5g', aminoHighlights: ['Gut Health', 'Recovery'] },
    { id: 'glycine', name: 'Glycine', category: 'boosters', proteinPerServing: 0, servingSize: '3g', aminoHighlights: ['Sleep', 'Collagen Synthesis'] },
    { id: 'creatine', name: 'Creatine Monohydrate', category: 'boosters', proteinPerServing: 0, servingSize: '5g', aminoHighlights: ['ATP', 'Strength'] },
    { id: 'hmb', name: 'HMB (β-Hydroxy β-Methylbutyrate)', category: 'boosters', proteinPerServing: 0, servingSize: '3g', aminoHighlights: ['Anti-Catabolic', 'Leucine Metabolite'] },
    { id: 'digestive-enzymes', name: 'Digestive Enzymes', category: 'boosters', proteinPerServing: 0, servingSize: '1 capsule', aminoHighlights: ['Absorption', 'Less Bloating'] },
    { id: 'betaine', name: 'Betaine Anhydrous', category: 'boosters', proteinPerServing: 0, servingSize: '2.5g', aminoHighlights: ['Power Output', 'Homocysteine'] },
    { id: 'taurine', name: 'Taurine', category: 'boosters', proteinPerServing: 0, servingSize: '2g', aminoHighlights: ['Cell Volume', 'Performance'] },
  ],
};
