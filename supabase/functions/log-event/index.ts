import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allow specific origins
const allowedOrigins = [
  "https://dsvikstrand.github.io",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string | null) {
  if (origin && allowedOrigins.includes(origin)) {
    return {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
    };
  }
  // Default to first allowed origin for non-browser requests
  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": allowedOrigins[0],
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { event_name, user_id, blueprint_id, path, metadata } = body;

    if (!event_name || typeof event_name !== "string") {
      return new Response(
        JSON.stringify({ error: "event_name is required" }),
        {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role to insert (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { error: insertError } = await adminClient
      .from("mvp_events")
      .insert({
        event_name,
        user_id: user_id || null,
        blueprint_id: blueprint_id || null,
        path: path || null,
        metadata: metadata || null,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  }
});
