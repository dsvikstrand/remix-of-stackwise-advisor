export interface InventoryRequest {
  keywords: string;
  title?: string;
  customInstructions?: string;
  preferredCategories?: string[];
}

export type GenerationOperation =
  | 'generateInventory'
  | 'generateBlueprint'
  | 'generateYouTubeBlueprint';

export interface GenerationPromptEvent {
  operation: GenerationOperation;
  instructions: string;
  prompt: string;
}

export type GenerationModelEvent =
  | {
      event: 'primary_success';
      operation: GenerationOperation;
      model_used: string;
      fallback_used: boolean;
      fallback_model?: string | null;
      reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null;
    }
  | {
      event: 'fallback_success';
      operation: GenerationOperation;
      model_used: string;
      fallback_used: boolean;
      fallback_model?: string | null;
      reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null;
    }
  | {
      event: 'request_failed';
      operation: GenerationOperation;
      model_used: string;
      fallback_used: boolean;
      fallback_model?: string | null;
      reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null;
      status?: number | null;
      message?: string | null;
    };

export interface LLMGenerationOptions {
  onGenerationModelEvent?: (event: GenerationModelEvent) => void;
  onGenerationPromptEvent?: (event: GenerationPromptEvent) => void;
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

export interface BannerRequest {
  title: string;
  inventoryTitle?: string;
  tags?: string[];
}

export interface BannerResult {
  buffer: Buffer;
  mimeType: string;
  prompt: string;
}

export interface BlueprintGenerationRequest {
  title?: string;
  description?: string;
  notes?: string;
  inventoryTitle: string;
  categories: Array<{ name: string; items: string[] }>;
}

export interface BlueprintStepItem {
  category: string;
  name: string;
  context?: string;
}

export interface BlueprintStep {
  title: string;
  description?: string;
  items: BlueprintStepItem[];
}

export interface BlueprintGenerationResult {
  title: string;
  steps: BlueprintStep[];
}

export interface YouTubeDraftStep {
  name: string;
  notes: string;
  timestamp?: string | null;
}

export interface YouTubeBlueprintRequest {
  videoUrl: string;
  videoTitle?: string;
  transcriptSource?: string;
  transcript: string;
  oraclePosDir?: string;
  positiveReferencePaths?: string[];
  qualityIssueCodes?: string[];
  qualityIssueDetails?: string[];
  additionalInstructions?: string;
}

export interface YouTubeBlueprintResult {
  title: string;
  description: string;
  steps: YouTubeDraftStep[];
  notes?: string | null;
  tags?: string[];
  summary_variants?: {
    default?: string | null;
    eli5?: string | null;
  } | null;
}

export interface ChannelLabelOption {
  slug: string;
  name: string;
  description: string;
  aliases?: string[];
}

export interface ChannelLabelRequest {
  title: string;
  llmReview?: string | null;
  tags?: string[];
  stepHints?: string[];
  fallbackSlug: string;
  allowedChannels: ChannelLabelOption[];
}

export interface ChannelLabelResult {
  channelSlug: string;
  reason?: string | null;
  confidence?: number | null;
}

export interface LLMClient {
  generateInventory(input: InventoryRequest, options?: LLMGenerationOptions): Promise<InventorySchema>;
  analyzeBlueprint(input: BlueprintAnalysisRequest): Promise<string>;
  generateBanner(input: BannerRequest): Promise<BannerResult>;
  generateBlueprint(input: BlueprintGenerationRequest, options?: LLMGenerationOptions): Promise<BlueprintGenerationResult>;
  generateYouTubeBlueprint(input: YouTubeBlueprintRequest, options?: LLMGenerationOptions): Promise<YouTubeBlueprintResult>;
  generateChannelLabel(input: ChannelLabelRequest): Promise<ChannelLabelResult>;
}
