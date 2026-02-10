export type InventorySchema = {
  summary?: string;
  categories: Array<{
    name: string;
    items: string[];
  }>;
};

export type GeneratedBlueprint = {
  title: string;
  steps: Array<{
    title: string;
    description: string;
    items: Array<{
      category: string;
      name: string;
      context?: string;
    }>;
  }>;
};

