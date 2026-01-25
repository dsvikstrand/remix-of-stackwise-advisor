import { CATEGORY_LABELS, SUPPLEMENT_CATALOG, PROTEIN_CATEGORY_LABELS, PROTEIN_CATALOG } from '@/types/stacklab';
import { DEFAULT_REVIEW_SECTIONS } from '@/lib/reviewSections';
import type { Json } from '@/integrations/supabase/types';

export interface InventorySeed {
  title: string;
  promptInventory: string;
  promptCategories: string;
  tags: string[];
  generatedSchema: Json;
  reviewSections?: string[];
}

function buildSchemaFromCatalog<T extends Record<string, { name: string }[]>>(
  labels: Record<string, string>,
  catalog: T
): Json {
  return {
    categories: Object.entries(catalog).map(([key, items]) => ({
      name: labels[key] ?? key,
      items: items.map((item) => item.name),
    })),
  };
}

export const DEFAULT_INVENTORY_SEEDS: InventorySeed[] = [
  {
    title: 'Blend Inventory',
    promptInventory: 'A curated library of supplements for building custom blends.',
    promptCategories: Object.values(CATEGORY_LABELS).join(', '),
    tags: ['blend', 'supplements', 'stack', 'performance', 'wellness'],
    generatedSchema: buildSchemaFromCatalog(CATEGORY_LABELS, SUPPLEMENT_CATALOG),
    reviewSections: DEFAULT_REVIEW_SECTIONS,
  },
  {
    title: 'Protein Inventory',
    promptInventory: 'Protein sources and boosters for building complete shakes.',
    promptCategories: Object.values(PROTEIN_CATEGORY_LABELS).join(', '),
    tags: ['protein', 'shake', 'amino', 'nutrition', 'recovery'],
    generatedSchema: buildSchemaFromCatalog(PROTEIN_CATEGORY_LABELS, PROTEIN_CATALOG),
    reviewSections: DEFAULT_REVIEW_SECTIONS,
  },
];
