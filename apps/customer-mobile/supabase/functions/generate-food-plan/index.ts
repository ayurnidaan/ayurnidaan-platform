import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";


type RecipeChoice = { meal: string; description: string; tags: string[] };
type MealPlan = { time: string; meal: string; tags: string[]; choices: RecipeChoice[] };
type FoodPlan = {
  why_this_plan: string;
  meals: { morning: MealPlan; midday: MealPlan; evening: MealPlan };
  favour: string[];
  limit: string[];
};

const parseJson = (content: string) => {
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); } catch { return null; }
};

const cleanText = (value: string, max = 300) => value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const validStrings = (value: unknown, minimum: number, maximum: number) => Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((item) => typeof item === "string" && item.trim().length > 0);
const validMeal = (value: unknown): value is MealPlan => {
  if (!value || typeof value !== "object") return false;
  const meal = value as Record<string, unknown>;
  const choices = Array.isArray(meal.choices) ? meal.choices : [];
  return typeof meal.time === "string" && meal.time.trim().length > 0 && typeof meal.meal === "string" && meal.meal.trim().length > 0 && validStrings(meal.tags, 1, 2) && choices.length === 3 && choices.every((choice) => Boolean(choice && typeof choice === "object" && typeof choice.meal === "string" && choice.meal.trim() && typeof choice.description === "string" && choice.description.trim() && validStrings(choice.tags, 1, 2)));
};
const validFoodPlan = (value: unknown): value is FoodPlan => {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  if (typeof plan.why_this_plan !== "string" || !plan.why_this_plan.trim() || !plan.meals || typeof plan.meals !== "object") return false;
  const meals = plan.meals as Record<string, unknown>;
  if (!validMeal(meals.morning) || !validMeal(meals.midday) || !validMeal(meals.evening) || !validStrings(plan.favour, 4, 6) || !validStrings(plan.limit, 4, 6)) return false;
  const recipeNames = [meals.morning, meals.midday, meals.evening].flatMap((meal) => meal.choices.map((choice) => choice.meal.trim().toLowerCase()));
  return new Set(recipeNames).size === 9;
};
const sanitizeChoices = (choices: RecipeChoice[]) => choices.map((choice) => ({ meal: cleanText(choice.meal), description: cleanText(choice.description, 180), tags: choice.tags.map((tag) => cleanText(tag, 40)) }));
const sanitizePlan = (plan: FoodPlan): FoodPlan => ({
  why_this_plan: cleanText(plan.why_this_plan, 360),
  meals: {
    morning: { time: "7–9 AM", meal: cleanText(plan.meals.morning.meal), tags: plan.meals.morning.tags.map((tag) => cleanText(tag, 40)), choices: sanitizeChoices(plan.meals.morning.choices) },
    midday: { time: "12–1 PM", meal: cleanText(plan.meals.midday.meal), tags: plan.meals.midday.tags.map((tag) => cleanText(tag, 40)), choices: sanitizeChoices(plan.meals.midday.choices) },
    evening: { time: "Before 8 PM", meal: cleanText(plan.meals.evening.meal), tags: plan.meals.evening.tags.map((tag) => cleanText(tag, 40)), choices: sanitizeChoices(plan.meals.evening.choices) },
  },
  favour: plan.favour.map((item) => cleanText(item, 100)),
  limit: plan.limit.map((item) => cleanText(item, 100)),
});
const recipeChoiceSchema = { type: "object", properties: { meal: { type: "string" }, description: { type: "string" }, tags: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } } }, required: ["meal", "description", "tags"], additionalProperties: false };
const mealSchema = (time: "7–9 AM" | "12–1 PM" | "Before 8 PM") => ({ type: "object", properties: { time: { type: "string", enum: [time] }, meal: { type: "string" }, tags: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } }, choices: { type: "array", minItems: 3, maxItems: 3, items: recipeChoiceSchema } }, required: ["time", "meal", "tags", "choices"], additionalProperties: false });

const buildFoodPrompt = (prakriti: string, vikruti: string, assessmentHistory: string) => `You are an Ayurvedic food recommendation assistant.

Your task is to create a personalized daily food plan based on the user's Ayurvedic assessment.

IMPORTANT:

- Use ONLY common foods that are readily found in Rajasthan and suitable for Rajasthan's summer climate.
- Do not recommend supplements, medicines, or rare/exotic foods.
- Do not repeat the same dish or main food item across meals; morning, midday, and evening must each be distinct and provide variety.
- Use the user's current symptoms and Vikruti as the PRIMARY basis.
- Use Prakriti as a SECONDARY consideration.
- Do not provide medical diagnosis or treatment.
- Do not invent symptoms that are not present in the assessment.

### Ayurvedic reasoning

When evaluating foods, consider:

1. Rasa: Madhura, Amla, Lavana, Katu, Tikta, Kashaya
2. Guna: Guru/Laghu, Manda/Tikshna, Shita/Ushna, Snigdha/Ruksha, Slakshna/Khara, Sandra/Drava, Mridu/Kathina, Sthira/Sara, Sukshma/Sthula, Picchila/Vishada
3. Virya: Shita/Ushna
4. Vipaka: Madhura/Amla/Katu
5. Prabhava, where relevant
6. Samanya-Vishesha Siddhanta where applicable

Prioritize the user's current symptoms first, then Vikruti, then Prakriti.

### Inputs

Prakriti:
${prakriti}

Vikruti:
${vikruti}

Current symptoms and assessment conversation:
${assessmentHistory}

### Create the daily meal plan

Generate exactly nine distinct recipes: three choices for each of the three meals below. Do not repeat a recipe, primary dish, or near-duplicate across any of the nine choices. Put the strongest recommendation first for each meal and repeat that first choice in the meal and tags fields.

1. Morning
- Suitable for the user's condition and time of day.
- Keep the meal practical and easy to prepare.
- Suggested time: 7–9 AM.

2. Midday
- This should generally be the main meal of the day.
- Suggested time: 12–1 PM.

3. Evening
- Keep the meal lighter than midday.
- Avoid unnecessarily late or heavy meals.
- Suggested time: Before 8 PM.

For each meal provide:
- Exactly three recipe choices.
- For every choice: a concise recipe name, one short display description, and 1–2 short tags describing its relevant qualities.

Examples of tags: "Cooling", "Easy to digest", "Light", "Main meal", "Low chilli", "Early", "Warm", "Hydrating"

### Favour

Provide 4–6 concise food types or examples that the user should generally favour. These should be suitable for direct display as bullet points. Prefer groups or recognizable food examples.

### Limit

Provide 4–6 concise food types or examples that the user should generally limit. These should be suitable for direct display as bullet points. Do not use absolute language such as "never eat". Prefer "limit" or "reduce".

### Why this plan

Provide ONE concise sentence explaining the overall Ayurvedic reasoning behind the meal plan. Do not mention unsupported symptoms. Do not make a medical diagnosis.

### Output

Return ONLY valid JSON in exactly this structure:

{
  "why_this_plan": "One concise sentence explaining the overall reasoning.",
  "meals": {
    "morning": { "time": "7–9 AM", "meal": "First recipe name", "tags": ["Tag 1", "Tag 2"], "choices": [{ "meal": "Recipe name", "description": "Short reason it suits the user", "tags": ["Tag 1", "Tag 2"] }, { "meal": "Second distinct recipe", "description": "Short reason", "tags": ["Tag 1"] }, { "meal": "Third distinct recipe", "description": "Short reason", "tags": ["Tag 1"] }] },
    "midday": { "time": "12–1 PM", "meal": "First recipe name", "tags": ["Tag 1", "Tag 2"], "choices": [{ "meal": "Recipe name", "description": "Short reason", "tags": ["Tag 1", "Tag 2"] }, { "meal": "Second distinct recipe", "description": "Short reason", "tags": ["Tag 1"] }, { "meal": "Third distinct recipe", "description": "Short reason", "tags": ["Tag 1"] }] },
    "evening": { "time": "Before 8 PM", "meal": "First recipe name", "tags": ["Tag 1", "Tag 2"], "choices": [{ "meal": "Recipe name", "description": "Short reason", "tags": ["Tag 1", "Tag 2"] }, { "meal": "Second distinct recipe", "description": "Short reason", "tags": ["Tag 1"] }, { "meal": "Third distinct recipe", "description": "Short reason", "tags": ["Tag 1"] }] }
  },
  "favour": ["Food type or example", "Food type or example", "Food type or example", "Food type or example"],
  "limit": ["Food type or example", "Food type or example", "Food type or example", "Food type or example"]
}`;

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
    const body = await request.json();
    const assessmentId = typeof body.assessmentId === "string" ? body.assessmentId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(assessmentId)) return Response.json({ error: "A valid assessment is required" }, { status: 400, headers: corsHeaders });
    const suppliedPatient = body.patientContext && typeof body.patientContext === "object" ? body.patientContext : null;
    const suppliedPrakriti = suppliedPatient ? ["vataPercentage", "pittaPercentage", "kaphaPercentage"].map((key) => Number(suppliedPatient[key])) : [];
    if (suppliedPatient && (suppliedPrakriti.some((value) => !Number.isFinite(value) || value < 0 || value > 100) || suppliedPrakriti.reduce((sum, value) => sum + value, 0) !== 100)) {
      return Response.json({ error: "Patient Prakriti percentages must be valid and total 100%" }, { status: 400, headers: corsHeaders });
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_MODEL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!apiKey || !model || !supabaseUrl || !anonKey) throw new Error("Food recommendation service is not configured");

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
    if (!userResponse.ok) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user?.id) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "generate-food-plan", 10, 86400);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The service is temporarily unavailable." : "Daily food-plan limit reached.", quota.unavailable ? 503 : 429);

    const assessmentResponse = await fetch(`${supabaseUrl}/rest/v1/current_health_assessments?select=id,user_id,symptoms,conclusion,vata_imbalanced,pitta_imbalanced,kapha_imbalanced,conversation&id=eq.${encodeURIComponent(assessmentId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { Authorization: authorization, apikey: anonKey } });
    const [assessment] = assessmentResponse.ok ? await assessmentResponse.json() : [];
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404, headers: corsHeaders });

    const prakritiResponse = suppliedPatient ? null : await fetch(`${supabaseUrl}/rest/v1/prakriti_assessments?select=vata_percentage,pitta_percentage,kapha_percentage&user_id=eq.${encodeURIComponent(user.id)}&order=completed_at.desc&limit=1`, { headers: { Authorization: authorization, apikey: anonKey } });
    const [storedPrakriti] = prakritiResponse?.ok ? await prakritiResponse.json() : [];
    const prakriti = suppliedPatient ? {
      vata_percentage: suppliedPrakriti[0],
      pitta_percentage: suppliedPrakriti[1],
      kapha_percentage: suppliedPrakriti[2],
      age: suppliedPatient.age ?? null,
      gender: suppliedPatient.gender ?? null,
      height_cm: suppliedPatient.heightCm ?? null,
      weight_kg: suppliedPatient.weightKg ?? null,
    } : storedPrakriti;
    if (!prakriti) return Response.json({ error: "Complete the Prakriti assessment before generating a food plan" }, { status: 409, headers: corsHeaders });

    const patientDetails = suppliedPatient ? [
      suppliedPatient.age !== null && suppliedPatient.age !== "" && Number.isFinite(Number(suppliedPatient.age)) ? `age ${Number(suppliedPatient.age)}` : null,
      ["male", "female", "other"].includes(suppliedPatient.gender) ? `gender ${suppliedPatient.gender}` : null,
      suppliedPatient.heightCm !== null && suppliedPatient.heightCm !== "" && Number.isFinite(Number(suppliedPatient.heightCm)) ? `height ${Number(suppliedPatient.heightCm)} cm` : null,
      suppliedPatient.weightKg !== null && suppliedPatient.weightKg !== "" && Number.isFinite(Number(suppliedPatient.weightKg)) ? `weight ${Number(suppliedPatient.weightKg)} kg` : null,
    ].filter(Boolean) : [];
    const prakritiText = `Vata ${prakriti.vata_percentage}%, Pitta ${prakriti.pitta_percentage}%, Kapha ${prakriti.kapha_percentage}%${patientDetails.length ? `; patient details: ${patientDetails.join(", ")}` : ""}`;
    const vikrutiText = assessment.conclusion || [assessment.vata_imbalanced && "Vata", assessment.pitta_imbalanced && "Pitta", assessment.kapha_imbalanced && "Kapha"].filter(Boolean).join("-") || "No clear Dosha imbalance identified";
    const messages = Array.isArray(assessment.conversation) ? assessment.conversation : [];
    const historyText = messages.filter((message: unknown) => message && typeof message === "object" && ((message as Record<string, unknown>).role === "assistant" || (message as Record<string, unknown>).role === "user") && typeof (message as Record<string, unknown>).content === "string").slice(-50).map((message: Record<string, unknown>) => `${message.role === "assistant" ? "Assessment" : "Patient"}: ${String(message.content).slice(0, 4000)}`).join("\n");
    const prompt = buildFoodPrompt(prakritiText, vikrutiText, historyText);

    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "ayurnidaan_food_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            why_this_plan: { type: "string" },
            meals: {
              type: "object",
              properties: {
                morning: mealSchema("7–9 AM"),
                midday: mealSchema("12–1 PM"),
                evening: mealSchema("Before 8 PM"),
              },
              required: ["morning", "midday", "evening"],
              additionalProperties: false,
            },
            favour: { type: "array", minItems: 4, maxItems: 6, items: { type: "string" } },
            limit: { type: "array", minItems: 4, maxItems: 6, items: { type: "string" } },
          },
          required: ["why_this_plan", "meals", "favour", "limit"],
          additionalProperties: false,
        },
      },
    };

    let foodPlan: FoodPlan | null = null;
    for (let attempt = 0; attempt < 3 && !foodPlan; attempt += 1) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan Food Recommendations" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }], response_format: responseFormat, plugins: [{ id: "response-healing" }], max_tokens: 2200 }),
      });
      if (!response.ok) {
        const providerError = (await response.text()).slice(0, 500);
        console.error("OpenRouter food-plan request failed", response.status, providerError);
        if (response.status === 429) throw new Error("Food-plan generation is temporarily rate-limited. Please try again shortly.");
        throw new Error(`Food-plan generation is temporarily unavailable (${response.status}).`);
      }
      const data = await response.json();
      const parsed = parseJson(data.choices?.[0]?.message?.content?.trim() ?? "");
      if (validFoodPlan(parsed)) foodPlan = sanitizePlan(parsed);
      else console.warn(`Rejected invalid food plan on attempt ${attempt + 1}`);
    }
    if (!foodPlan) throw new Error("The AI model did not return a valid food plan");

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/food_recommendation_plans?on_conflict=current_health_assessment_id`, {
      method: "POST",
      headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: user.id, current_health_assessment_id: assessment.id, prakriti, vikruti: vikrutiText, assessment_history: messages, plan: foodPlan, model, updated_at: new Date().toISOString() }),
    });
    if (!saveResponse.ok) {
      console.error("Food plan save failed", saveResponse.status, (await saveResponse.text()).slice(0, 500));
      throw new Error("The food plan was generated but could not be saved");
    }
    return Response.json({ plan: foodPlan, vikruti: vikrutiText }, { headers: corsHeaders });
  } catch (error) {
    console.error("Food recommendation generation failed", error instanceof Error ? error.message : "Unexpected error");
    return publicError(corsHeaders, "Food-plan generation is temporarily unavailable.");
  }
});
