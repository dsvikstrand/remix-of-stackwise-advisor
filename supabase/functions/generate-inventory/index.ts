import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INVENTORY_SYSTEM_PROMPT = `You are an expert curator who creates comprehensive inventory schemas for various domains.

Your job is to generate a structured inventory of items organized into logical categories based on user input keywords.

Guidelines:
- Create 4-8 relevant categories based on the domain
- Include 6-12 items per category
- Default to general item names (e.g., "Gentle Cleanser" instead of "Salicylic Acid Cleanser")
- Only use highly specific or ingredient-level items if the user explicitly asks for specificity
- Avoid brand names unless the user explicitly requests them
- Items should be real, commonly used products/ingredients/tools in that domain
- Cover a range from beginner-friendly to advanced options

Response format (STRICT JSON - no markdown, no explanation):
{
  "summary": "Brief 1-2 sentence description of what this inventory covers",
  "categories": [
    {
      "name": "Category Name",
      "items": ["Item 1", "Item 2", "Item 3", ...]
    }
  ],
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4"]
}

Examples of domains and what to include:
- "skincare routine" → Cleansers, Toners, Serums, Moisturizers, SPF, Treatments, Tools
- "green smoothie" → Leafy Greens, Fruits, Proteins, Liquids, Boosters, Sweeteners
- "home workout" → Warm-up, Cardio, Strength Upper, Strength Lower, Core, Stretching
- "morning routine" → Wake-up, Hygiene, Movement, Nutrition, Mindfulness, Planning
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, title } = await req.json();

    if (!keywords || typeof keywords !== 'string' || keywords.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Keywords are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userPrompt = `Generate a comprehensive inventory schema for: "${keywords.trim()}"
${title ? `Title hint: ${title}` : ''}

Create practical, real-world items that someone would actually use for this purpose.
Default to general item names and only get highly specific if the user asks for specificity.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: INVENTORY_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
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
        JSON.stringify({ error: "Failed to generate inventory. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON response - handle potential markdown wrapping
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    }
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    jsonContent = jsonContent.trim();

    const schema = JSON.parse(jsonContent);

    // Validate the schema structure
    if (!schema.categories || !Array.isArray(schema.categories)) {
      throw new Error("Invalid schema: missing categories array");
    }

    return new Response(
      JSON.stringify(schema),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-inventory error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
