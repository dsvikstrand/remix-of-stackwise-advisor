import type { InventoryRequest, InventorySchema, LLMClient } from './types';

export function createMockClient(): LLMClient {
  return {
    async generateInventory(input: InventoryRequest): Promise<InventorySchema> {
      const title = input.title?.trim() || `${input.keywords.trim()} Inventory`;
      return {
        summary: `A starter inventory for ${title.toLowerCase()}.`,
        categories: [
          { name: 'Category 1', items: ['Item A', 'Item B', 'Item C'] },
          { name: 'Category 2', items: ['Item D', 'Item E', 'Item F'] },
          { name: 'Category 3', items: ['Item G', 'Item H', 'Item I'] },
          { name: 'Category 4', items: ['Item J', 'Item K', 'Item L'] },
          { name: 'Category 5', items: ['Item M', 'Item N', 'Item O'] },
          { name: 'Category 6', items: ['Item P', 'Item Q', 'Item R'] },
        ],
        suggestedTags: ['starter', 'routine', 'blueprint', 'community'],
      };
    },
  };
}
