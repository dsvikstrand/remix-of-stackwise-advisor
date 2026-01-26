import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ADDITIONAL_SECTIONS = ["Strengths", "Gaps", "Suggestions"];
const MAX_ADDITIONAL_SECTIONS = 3;

function normalizeReviewSections(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  const normalized: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    // Skip "Overview" as it's always included
    if (cleaned.toLowerCase() === "overview") continue;
    const exists = normalized.some((section) => section.toLowerCase() === cleaned.toLowerCase());
    if (exists) continue;
    normalized.push(cleaned);
    if (normalized.length >= MAX_ADDITIONAL_SECTIONS) break;
  }
  return normalized;
}

function buildSystemPrompt(additionalSections: string[], includeScore: boolean) {
  const allSections = ["Overview", ...additionalSections];
  const headings = allSections.map((section) => `### ${section}`).join("\n");
  
  const scoreInstruction = includeScore
    ? "\n- In the Overview section, include a line: `Score: X/100` where X is your overall assessment of the blueprint's effectiveness."
    : "";

  return `You are a helpful analyst for user-created blueprints (routines, habits, workflows, protocols).

Your job:
1) Summarize what this blueprint accomplishes
2) Highlight strengths and gaps
3) Suggest optimizations or missing pieces
4) Provide a short, actionable review

Guidelines:
- Keep it concise and clear
- For Strengths, Gaps, Risks, and Suggestions sections: ALWAYS use bullet points starting with a dash and space (\`- \`). Never use \`+\`, \`*\`, or paragraph-style formatting for these sections.${scoreInstruction}
- Avoid medical claims; be cautious
- Do not add extra headings

Response format (use these exact headings in order):
${headings}
`;
}

function formatSelectedItems(selectedItems: Record<string, unknown[]>) {
  const lines: string[] = [];
  for (const [category, items] of Object.entries(selectedItems || {})) {
    if (!Array.isArray(items) || items.length === 0) continue;
    lines.push(`## ${category}`);
    for (const item of items) {
      if (typeof item === 'string') {
        lines.push(`- ${item}`);
      } else if (item && typeof item === 'object') {
        const obj = item as { name?: string; context?: string };
        const name = obj.name || String(item);
        const context = obj.context?.trim();
        lines.push(context ? `- ${name} [${context}]` : `- ${name}`);
      } else {
        lines.push(`- ${String(item)}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, inventoryTitle, selectedItems, mixNotes, reviewPrompt, reviewSections, includeScore } = await req.json();

    if (!selectedItems || typeof selectedItems !== 'object') {
      return new Response(
        JSON.stringify({ error: "Selected items are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const additionalSections = normalizeReviewSections(reviewSections);
    const resolvedAdditionalSections = additionalSections.length > 0 ? additionalSections : DEFAULT_ADDITIONAL_SECTIONS;
    const shouldIncludeScore = includeScore !== false;

    const itemsBlock = formatSelectedItems(selectedItems);
    const focus = reviewPrompt?.trim() || 'general effectiveness';
    const allSections = ["Overview", ...resolvedAdditionalSections];

    const userPrompt = `Review this blueprint and focus on: ${focus}

Blueprint title: ${title || 'Untitled'}
Inventory: ${inventoryTitle || 'N/A'}
Requested sections: ${allSections.join(', ')}
Include score in Overview: ${shouldIncludeScore ? 'Yes' : 'No'}

Selected items:
${itemsBlock || '- No items listed'}

Mix notes:
${mixNotes?.trim() || 'None'}
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: buildSystemPrompt(resolvedAdditionalSections, shouldIncludeScore) },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze blueprint. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("analyze-blueprint error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
