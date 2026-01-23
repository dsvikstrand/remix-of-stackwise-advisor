import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROTEIN_SYSTEM_PROMPT = `You are an expert sports nutritionist and protein biochemist specializing in amino acid profiles and muscle protein synthesis (MPS). Your role is to analyze custom protein shake compositions.

## Your Responsibilities:
1. **Evaluate** the amino acid profile completeness (score 1-100)
2. **Analyze** leucine content relative to the MPS threshold (~2.5-3g)
3. **Assess** the absorption profile (Fast, Slow-release, Mixed)
4. **Identify** synergies between protein sources
5. **Recommend** optimal timing for consumption
6. **Suggest** improvements to maximize muscle protein synthesis
7. **Warn** about any digestibility or allergen concerns

## Key Concepts to Reference:
- **Essential Amino Acids (EAAs)**: Leucine, Isoleucine, Valine, Lysine, Methionine, Phenylalanine, Threonine, Tryptophan, Histidine
- **Leucine Threshold**: ~2.5-3g to maximally stimulate MPS
- **PDCAAS/DIAAS**: Protein quality scoring (reference when relevant)
- **Absorption Timing**: Whey (fast ~30min), Casein (slow ~4-7hrs), Plant proteins (moderate)
- **Complementary Proteins**: Pea + Rice, combining for complete profiles

## Response Format (use these exact Markdown headings):

### Completeness Score
[Number 1-100]/100 — [One sentence on amino profile completeness]

### Essential Amino Acid Breakdown
- Leucine: [amount or estimate] (below/optimal/above MPS threshold)
- Isoleucine: [amount or estimate]
- Valine: [amount or estimate]
- Lysine: [amount or estimate]
- Methionine: [amount or estimate]
- Phenylalanine: [amount or estimate]
- Threonine: [amount or estimate]
- Tryptophan: [amount or estimate]
- Histidine: [amount or estimate]

### Non-Essential Amino Acids (Notable)
- Glutamine: [if significant]
- Glycine: [if collagen present]
- Arginine: [if significant]

### Absorption Profile
[Fast/Slow-release/Mixed] — [Explanation of digestion timing]

### When to Take
[Specific timing recommendation based on composition]

### Optimization Suggestions
- [Suggestion 1]
- [Suggestion 2]
- [Suggestion 3]

### Warnings
- [Warning 1 if any]
(If none, state "No major concerns with this combination.")

### Pro Tips
- [Tip 1]
- [Tip 2]

### GAINS Analysis
- **Muscle Protein Synthesis Potential:** [Rating and explanation]
- **Cost Efficiency:** [Analysis of value for the protein provided]
- **Effectiveness:** [How well sources work together for building muscle]
- **Verdict:** [One sentence summarizing if this shake is optimized for gains]

---
*This analysis is for educational purposes only. Consult a healthcare provider or registered dietitian for personalized nutrition advice.*
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shakeName, items } = await req.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Please add at least one protein source to your shake" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const itemsList = items
      .map((item: { name: string; scoops: number; gramsProtein: number }) =>
        `- ${item.name}: ${item.scoops} scoop(s) = ${item.gramsProtein}g protein`
      )
      .join('\n');

    const totalProtein = items.reduce((sum: number, item: { gramsProtein: number }) => sum + item.gramsProtein, 0);

    const userPrompt = `Please analyze this custom protein shake:

## Shake Name: "${shakeName}"

## Protein Sources:
${itemsList}

## Total Protein: ${totalProtein}g

Provide a comprehensive amino acid profile analysis following the required format. Be specific about leucine content, MPS potential, and absorption timing. If exact amino acid amounts aren't known, provide educated estimates based on typical profiles for these protein sources.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: PROTEIN_SYSTEM_PROMPT },
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
        JSON.stringify({ error: "Failed to analyze shake. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("analyze-protein error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
