 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "https://dsvikstrand.github.io",
   "Access-Control-Allow-Headers": "Authorization, Content-Type",
   "Access-Control-Allow-Methods": "POST, OPTIONS",
 };
 
 Deno.serve(async (req) => {
   // Handle CORS preflight
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   if (req.method !== "POST") {
     return new Response(JSON.stringify({ error: "Method not allowed" }), {
       status: 405,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   }
 
   try {
     // Validate authorization header
     const authHeader = req.headers.get("Authorization");
     if (!authHeader?.startsWith("Bearer ")) {
       return new Response(JSON.stringify({ error: "Unauthorized" }), {
         status: 401,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }
 
     const token = authHeader.replace("Bearer ", "");
 
     // Verify user with anon client
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 
     const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
       auth: { persistSession: false },
     });
 
     const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
     if (claimsError || !claimsData?.claims?.sub) {
       return new Response(JSON.stringify({ error: "Unauthorized" }), {
         status: 401,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }
 
     const userId = claimsData.claims.sub as string;
 
     // Parse request body
     const body = await req.json();
     const { contentType, imageBase64 } = body;
 
     if (!contentType || !imageBase64) {
       return new Response(
         JSON.stringify({ error: "Missing contentType or imageBase64" }),
         {
           status: 400,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     // Validate content type
     const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
     if (!allowedTypes.includes(contentType)) {
       return new Response(
         JSON.stringify({ error: "Invalid content type" }),
         {
           status: 400,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     // Decode base64 to binary
     const binaryString = atob(imageBase64);
     const bytes = new Uint8Array(binaryString.length);
     for (let i = 0; i < binaryString.length; i++) {
       bytes[i] = binaryString.charCodeAt(i);
     }
 
     // Generate filename
     const extension = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
     const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
 
     // Upload using service role client
     const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
       auth: { persistSession: false },
     });
 
     const { error: uploadError } = await adminClient.storage
       .from("blueprint-banners")
       .upload(filename, bytes, {
         contentType,
         upsert: true,
       });
 
     if (uploadError) {
       console.error("Upload error:", uploadError);
       return new Response(
         JSON.stringify({ error: uploadError.message }),
         {
           status: 500,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     // Get public URL
     const { data: publicData } = adminClient.storage
       .from("blueprint-banners")
       .getPublicUrl(filename);
 
     return new Response(
       JSON.stringify({ bannerUrl: publicData.publicUrl }),
       {
         status: 200,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       }
     );
   } catch (error) {
     console.error("Error:", error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       {
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       }
     );
   }
 });