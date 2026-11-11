import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";


type RecognisedItem = {
  name: string;
  serving_label: string;
  calories: number;
  protein: number;
  fat: number;
  confidence: "high" | "likely" | "low";
};

const parseJson = (content: string) => {
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); } catch { return null; }
};

const cleanText = (value: string, max: number) => value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const validNumber = (value: unknown, maximum: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
const validResult = (value: unknown): value is { items: RecognisedItem[] } => {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).items)) return false;
  const items = (value as { items: unknown[] }).items;
  return items.length >= 1 && items.length <= 8 && items.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    return typeof item.name === "string" && item.name.trim().length > 0 && typeof item.serving_label === "string" && item.serving_label.trim().length > 0 && validNumber(item.calories, 5000) && validNumber(item.protein, 500) && validNumber(item.fat, 500) && ["high", "likely", "low"].includes(String(item.confidence));
  });
};

const prompt = `You are a food plate recognition assistant for a nutrition tracking application used in India.

Examine the supplied meal photograph and identify each visually distinct food item. Use familiar, patient-friendly Indian food names where appropriate.

For every identified item, return:
- the most likely food name;
- a concise visible serving estimate such as "1 bowl each", "1 katori each", "1 roti", or "1 tsp each";
- estimated calories, protein in grams, and fat in grams for that single visible serving;
- confidence: "high" when clearly identifiable, "likely" when reasonably probable, or "low" when uncertain.

Important:
- Return 1–8 items only.
- Separate distinct foods instead of treating the whole plate as one dish.
- Do not claim exact laboratory precision; use reasonable standard nutrition estimates.
- Do not invent ingredients that are not visible or strongly implied by the dish.
- Return only valid JSON matching the requested schema.`;

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "meal_scan_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              serving_label: { type: "string" },
              calories: { type: "number" },
              protein: { type: "number" },
              fat: { type: "number" },
              confidence: { type: "string", enum: ["high", "likely", "low"] },
            },
            required: ["name", "serving_label", "calories", "protein", "fat", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
    const body = await request.json();
    const imageBase64 = typeof body.image_base64 === "string" ? body.image_base64.replace(/^data:[^;]+;base64,/, "") : "";
    const mimeType = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(body.mime_type) ? body.mime_type : "image/jpeg";
    if (!imageBase64 || imageBase64.length > 12_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64)) return Response.json({ error: "A valid meal image under 9 MB is required" }, { status: 400, headers: corsHeaders });

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_VISION_MODEL") || Deno.env.get("OPENROUTER_MODEL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!apiKey || !model || !supabaseUrl || !anonKey) throw new Error("Meal recognition service is not configured");

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
    if (!userResponse.ok) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user?.id) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "scan-food-meal", 20, 86400);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The service is temporarily unavailable." : "Daily meal-scan limit reached.", quota.unavailable ? 503 : 429);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan Meal Scanner" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] }],
        response_format: responseFormat,
        plugins: [{ id: "response-healing" }],
        max_tokens: 1000,
      }),
    });
    if (!response.ok) {
      console.error("OpenRouter meal scan failed", response.status, (await response.text()).slice(0, 500));
      throw new Error(response.status === 429 ? "Meal recognition is busy. Please try again shortly." : "Meal recognition is temporarily unavailable.");
    }
    const providerData = await response.json();
    const parsed = parseJson(providerData.choices?.[0]?.message?.content?.trim() ?? "");
    if (!validResult(parsed)) throw new Error("No recognisable food items were returned");
    return Response.json({ items: parsed.items.map((item) => ({ name: cleanText(item.name, 120), serving_label: cleanText(item.serving_label, 80), calories: Math.round(item.calories), protein: Math.round(item.protein), fat: Math.round(item.fat), confidence: item.confidence })) }, { headers: corsHeaders });
  } catch (error) {
    console.error("Meal recognition failed", error instanceof Error ? error.message : "Unexpected error");
    return publicError(corsHeaders, "Meal recognition is temporarily unavailable.");
  }
});
