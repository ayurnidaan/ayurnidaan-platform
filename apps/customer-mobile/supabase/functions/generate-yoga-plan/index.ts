import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";


type YogaPractice = { yoga: string; duration: string; reasoning: string };
type YogaSession = { day: number; duration: string; focus: string; practices: YogaPractice[] };
type YogaPlan = { why_this_plan: string; sessions: YogaSession[] };

const parseJson = (content: string) => {
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); } catch { return null; }
};
const cleanText = (value: string, max = 300) => value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const isYogaPlan = (value: unknown, availableNames: Set<string>): value is YogaPlan => {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  if (typeof plan.why_this_plan !== "string" || !plan.why_this_plan.trim() || !Array.isArray(plan.sessions) || plan.sessions.length !== 3) return false;
  return plan.sessions.every((session, index) => {
    if (!session || typeof session !== "object") return false;
    const item = session as Record<string, unknown>;
    if (item.day !== index + 1 || item.duration !== "15 minutes" || typeof item.focus !== "string" || !item.focus.trim() || !Array.isArray(item.practices) || item.practices.length !== 3) return false;
    return item.practices.every((practice) => {
      if (!practice || typeof practice !== "object") return false;
      const pose = practice as Record<string, unknown>;
      return typeof pose.yoga === "string" && availableNames.has(pose.yoga) && pose.duration === "5 minutes" && typeof pose.reasoning === "string" && pose.reasoning.trim().length > 0;
    });
  });
};
const sanitizePlan = (plan: YogaPlan): YogaPlan => ({
  why_this_plan: cleanText(plan.why_this_plan, 360),
  sessions: plan.sessions.map((session, index) => ({
    day: index + 1,
    duration: "15 minutes",
    focus: cleanText(session.focus, 80),
    practices: session.practices.map((practice) => ({ yoga: practice.yoga, duration: "5 minutes", reasoning: cleanText(practice.reasoning, 220) })),
  })),
});

const buildYogaPrompt = (prakriti: string, vikruti: string, assessmentHistory: string, poseNames: string[]) => `You are an Ayurvedic yoga recommendation assistant.

Create a personalized three-day yoga plan based on the user's Ayurvedic assessment.

IMPORTANT:
- Use the user's current symptoms and Vikruti as the PRIMARY basis.
- Use Prakriti as a SECONDARY consideration.
- Select yoga practices ONLY from the available pose names below.
- Copy every selected yoga name exactly as written in the available list.
- Do not invent poses, symptoms, diagnoses, contraindications, or medical treatment.
- Keep the plan gentle, practical, and appropriate for a general wellness context.
- Each day must contain exactly three practices of 5 minutes each, totaling 15 minutes.
- Give a brief, assessment-grounded reason for every practice.

Prakriti:
${prakriti}

Vikruti:
${vikruti}

Current symptoms and assessment conversation:
${assessmentHistory}

Available yoga poses (names only):
${poseNames.join("\n")}

Return ONLY valid JSON in exactly this structure:
{
  "why_this_plan": "The three-day plan is designed to gradually support the user's current Vikruti while considering their Prakriti.",
  "sessions": [
    {
      "day": 1,
      "duration": "15 minutes",
      "focus": "Gentle balancing",
      "practices": [
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." },
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." },
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." }
      ]
    },
    {
      "day": 2,
      "duration": "15 minutes",
      "focus": "Strength and balance",
      "practices": [
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." },
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." },
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." }
      ]
    },
    {
      "day": 3,
      "duration": "15 minutes",
      "focus": "Calming and restoration",
      "practices": [
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." },
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." },
        { "yoga": "Exact yoga name from inventory", "duration": "5 minutes", "reasoning": "Brief reason this practice is appropriate." }
      ]
    }
  ]
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
    if (suppliedPatient && (suppliedPrakriti.some((value) => !Number.isFinite(value) || value < 0 || value > 100) || suppliedPrakriti.reduce((sum, value) => sum + value, 0) !== 100)) return Response.json({ error: "Patient Prakriti percentages must be valid and total 100%" }, { status: 400, headers: corsHeaders });

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_MODEL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!apiKey || !model || !supabaseUrl || !anonKey) throw new Error("Yoga recommendation service is not configured");

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
    if (!userResponse.ok) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user?.id) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "generate-yoga-plan", 10, 86400);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The service is temporarily unavailable." : "Daily yoga-plan limit reached.", quota.unavailable ? 503 : 429);

    const assessmentResponse = await fetch(`${supabaseUrl}/rest/v1/current_health_assessments?select=id,user_id,conclusion,conversation&id=eq.${encodeURIComponent(assessmentId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { Authorization: authorization, apikey: anonKey } });
    const [assessment] = assessmentResponse.ok ? await assessmentResponse.json() : [];
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404, headers: corsHeaders });

    const prakritiResponse = suppliedPatient ? null : await fetch(`${supabaseUrl}/rest/v1/prakriti_assessments?select=vata_percentage,pitta_percentage,kapha_percentage&user_id=eq.${encodeURIComponent(user.id)}&order=completed_at.desc&limit=1`, { headers: { Authorization: authorization, apikey: anonKey } });
    const [storedPrakriti] = prakritiResponse?.ok ? await prakritiResponse.json() : [];
    const prakriti = suppliedPatient ? { vata_percentage: suppliedPrakriti[0], pitta_percentage: suppliedPrakriti[1], kapha_percentage: suppliedPrakriti[2] } : storedPrakriti;
    if (!prakriti) return Response.json({ error: "Complete the Prakriti assessment before generating a yoga plan" }, { status: 409, headers: corsHeaders });

    const posesResponse = await fetch(`${supabaseUrl}/rest/v1/yoga_poses?select=name&active=eq.true&order=sort_order.asc`, { headers: { Authorization: authorization, apikey: anonKey } });
    const poseRows = posesResponse.ok ? await posesResponse.json() : [];
    const poseNames = poseRows.map((pose: { name?: unknown }) => typeof pose.name === "string" ? pose.name : "").filter(Boolean);
    if (!poseNames.length) throw new Error("The yoga pose inventory is unavailable");
    const availableNames = new Set<string>(poseNames);

    const patientDetails = suppliedPatient ? [
      suppliedPatient.age !== null && suppliedPatient.age !== "" && Number.isFinite(Number(suppliedPatient.age)) ? `age ${Number(suppliedPatient.age)}` : null,
      ["male", "female", "other"].includes(suppliedPatient.gender) ? `gender ${suppliedPatient.gender}` : null,
      suppliedPatient.heightCm !== null && suppliedPatient.heightCm !== "" && Number.isFinite(Number(suppliedPatient.heightCm)) ? `height ${Number(suppliedPatient.heightCm)} cm` : null,
      suppliedPatient.weightKg !== null && suppliedPatient.weightKg !== "" && Number.isFinite(Number(suppliedPatient.weightKg)) ? `weight ${Number(suppliedPatient.weightKg)} kg` : null,
    ].filter(Boolean) : [];
    const prakritiText = `Vata ${prakriti.vata_percentage}%, Pitta ${prakriti.pitta_percentage}%, Kapha ${prakriti.kapha_percentage}%${patientDetails.length ? `; patient details: ${patientDetails.join(", ")}` : ""}`;
    const vikrutiText = assessment.conclusion || "No clear Dosha imbalance identified";
    const messages = Array.isArray(assessment.conversation) ? assessment.conversation : [];
    const historyText = messages.filter((message: unknown) => message && typeof message === "object" && ((message as Record<string, unknown>).role === "assistant" || (message as Record<string, unknown>).role === "user") && typeof (message as Record<string, unknown>).content === "string").slice(-50).map((message: Record<string, unknown>) => `${message.role === "assistant" ? "Assessment" : "Patient"}: ${String(message.content).slice(0, 4000)}`).join("\n");
    const prompt = buildYogaPrompt(prakritiText, vikrutiText, historyText, poseNames);

    const practiceSchema = { type: "object", properties: { yoga: { type: "string", enum: poseNames }, duration: { type: "string", enum: ["5 minutes"] }, reasoning: { type: "string" } }, required: ["yoga", "duration", "reasoning"], additionalProperties: false };
    const sessionSchema = { type: "object", properties: { day: { type: "integer", enum: [1, 2, 3] }, duration: { type: "string", enum: ["15 minutes"] }, focus: { type: "string" }, practices: { type: "array", minItems: 3, maxItems: 3, items: practiceSchema } }, required: ["day", "duration", "focus", "practices"], additionalProperties: false };
    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "ayurnidaan_yoga_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            why_this_plan: { type: "string" },
            sessions: {
              type: "array", minItems: 3, maxItems: 3,
              items: sessionSchema,
            },
          },
          required: ["why_this_plan", "sessions"],
          additionalProperties: false,
        },
      },
    };

    let yogaPlan: YogaPlan | null = null;
    for (let attempt = 0; attempt < 3 && !yogaPlan; attempt += 1) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan Yoga Recommendations" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }], response_format: responseFormat, plugins: [{ id: "response-healing" }], max_tokens: 1800 }),
      });
      if (!response.ok) {
        const providerError = (await response.text()).slice(0, 500);
        console.error("OpenRouter yoga-plan request failed", response.status, providerError);
        if (response.status === 429) throw new Error("Yoga-plan generation is temporarily rate-limited. Please try again shortly.");
        throw new Error(`Yoga-plan generation is temporarily unavailable (${response.status}).`);
      }
      const data = await response.json();
      const parsed = parseJson(data.choices?.[0]?.message?.content?.trim() ?? "");
      if (isYogaPlan(parsed, availableNames)) yogaPlan = sanitizePlan(parsed);
      else console.warn(`Rejected invalid yoga plan on attempt ${attempt + 1}`);
    }
    if (!yogaPlan) throw new Error("The AI model did not return a valid yoga plan");

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/yoga_recommendation_plans?on_conflict=current_health_assessment_id`, {
      method: "POST",
      headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: user.id, current_health_assessment_id: assessment.id, prakriti, vikruti: vikrutiText, assessment_history: messages, plan: yogaPlan, model, updated_at: new Date().toISOString() }),
    });
    if (!saveResponse.ok) {
      console.error("Yoga plan save failed", saveResponse.status, (await saveResponse.text()).slice(0, 500));
      throw new Error("The yoga plan was generated but could not be saved");
    }
    return Response.json({ plan: yogaPlan, vikruti: vikrutiText }, { headers: corsHeaders });
  } catch (error) {
    console.error("Yoga recommendation generation failed", error instanceof Error ? error.message : "Unexpected error");
    return publicError(corsHeaders, "Yoga-plan generation is temporarily unavailable.");
  }
});
