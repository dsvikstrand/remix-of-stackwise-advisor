export interface InventoryRequest {
  keywords: string;
  title?: string;
  customInstructions?: string;
  preferredCategories?: string[];
}

export interface InventorySchema {
  summary: string;
  categories: Array<{ name: string; items: string[] }>;
  suggestedTags?: string[];
}

export interface LLMClient {
  generateInventory(input: InventoryRequest): Promise<InventorySchema>;
}
