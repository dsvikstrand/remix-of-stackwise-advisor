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

export interface BlueprintSelectedItem {
  name: string;
  context?: string;
}

export interface BlueprintAnalysisRequest {
  title: string;
  inventoryTitle: string;
  selectedItems: Record<string, BlueprintSelectedItem[]>;
  mixNotes?: string;
  reviewPrompt?: string;
  reviewSections?: string[];
  includeScore?: boolean;
}

export interface LLMClient {
  generateInventory(input: InventoryRequest): Promise<InventorySchema>;
  analyzeBlueprint(input: BlueprintAnalysisRequest): Promise<string>;
}
