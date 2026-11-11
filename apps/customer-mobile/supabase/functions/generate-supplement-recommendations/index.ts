import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";


type Domain = "hunger" | "thirst" | "sleep" | "stool" | "urine" | "sweat";
type QuestionId = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7";
type InventorySymptom = { domain: string; symptom: string };
type QuestionnaireAnswer = { id: string; text: string; normal?: boolean; inventoryMatch?: InventorySymptom };
type QuestionnaireQuestion = { id: QuestionId; question: string; legacyDomain?: Domain; legacyQuestion?: string; legacyNormal?: string; answers: QuestionnaireAnswer[] };
type StoredQuestionnaireAnswer = { answerId: string; text: string };
type InventoryProduct = {
  id: string;
  name: string;
  primary_category: string;
  for_symptoms: string[];
  pacifies: string[];
  may_aggravate: string[];
};
type SupplementRecommendation = { supplement: string; reasoning: string };
type SupplementPlan = { recommendations: SupplementRecommendation[] };

const questionnaireVersion = "VIKRITI_CORE_V1.0";
const domainQuestions: QuestionnaireQuestion[] = [
  { id: "Q1", legacyDomain: "hunger", legacyQuestion: "How would you describe your appetite recently?", legacyNormal: "Regular, predictable", question: "How has your appetite been over the last 7–14 days?", answers: [
    { id: "APPETITE_VARIABLE", text: "It varies a lot — sometimes I feel hungry, sometimes I do not.", inventoryMatch: { domain: "hunger", symptom: "Variable, inconsistent" } },
    { id: "APPETITE_STRONG", text: "I feel very hungry or need to eat more frequently than usual.", inventoryMatch: { domain: "hunger", symptom: "Strong, frequent" } },
    { id: "APPETITE_LOW", text: "My appetite is low, and I often do not feel like eating." },
    { id: "APPETITE_NORMAL", text: "My appetite is normal and fairly regular.", normal: true },
  ] },
  { id: "Q2", question: "How do you usually feel after eating a regular meal?", answers: [
    { id: "POSTMEAL_BLOATING", text: "I often feel bloated, gassy, or my digestion feels unpredictable." },
    { id: "POSTMEAL_BURNING", text: "I often feel burning, acidity, sourness, or excessive heat." },
    { id: "POSTMEAL_HEAVINESS", text: "I often feel heavy, sluggish, overly full, or sleepy after eating." },
    { id: "POSTMEAL_NORMAL", text: "I usually feel comfortable and digest my food well.", normal: true },
  ] },
  { id: "Q3", legacyDomain: "stool", legacyQuestion: "How would you describe your bowel movements recently?", legacyNormal: "Regular, well-formed", question: "Which option best describes your bowel movements recently?", answers: [
    { id: "STOOL_DRY_HARD", text: "Hard, dry, or difficult to pass; I may feel constipated.", inventoryMatch: { domain: "stool", symptom: "Hard, dry, difficult" } },
    { id: "STOOL_LOOSE_BURNING", text: "Loose or more frequent than usual, sometimes with burning or urgency.", inventoryMatch: { domain: "stool", symptom: "Loose, frequent" } },
    { id: "STOOL_STICKY_HEAVY", text: "Sticky, heavy, or difficult to clean; I may feel incompletely emptied." },
    { id: "STOOL_NORMAL", text: "Mostly regular, well-formed, and comfortable.", normal: true },
    { id: "STOOL_VARIABLE", text: "They vary considerably from day to day." },
  ] },
  { id: "Q4", legacyDomain: "urine", legacyQuestion: "How would you describe your urination recently?", legacyNormal: "Regular, comfortable", question: "Have you noticed any of these changes in your urination recently?", answers: [
    { id: "URINE_REDUCED_IRREGULAR", text: "Urination is reduced, irregular, or sometimes difficult.", inventoryMatch: { domain: "urine", symptom: "Infrequent, reduced" } },
    { id: "URINE_DARK_BURNING", text: "Urine is unusually dark yellow, or I experience burning while urinating." },
    { id: "URINE_FREQUENT_INCREASED", text: "I need to urinate much more frequently or in larger amounts than usual.", inventoryMatch: { domain: "urine", symptom: "Frequent, increased" } },
    { id: "URINE_NORMAL", text: "My urination is normal and comfortable.", normal: true },
  ] },
  { id: "Q5", legacyDomain: "sweat", legacyQuestion: "How would you describe your sweating recently?", legacyNormal: "Normal, moderate", question: "How has your sweating been recently compared with what is normal for you?", answers: [
    { id: "SWEAT_LOW_DRY", text: "I sweat very little, and my skin often feels dry.", inventoryMatch: { domain: "sweat", symptom: "Little, reduced" } },
    { id: "SWEAT_HIGH_HOT", text: "I sweat more than usual, especially with a feeling of heat, burning, or strong body odour.", inventoryMatch: { domain: "sweat", symptom: "Excessive, frequent" } },
    { id: "SWEAT_STICKY_HEAVY", text: "My sweating often feels sticky or is associated with a heavy/oily feeling." },
    { id: "SWEAT_NORMAL", text: "My sweating feels normal for me.", normal: true },
  ] },
  { id: "Q6", legacyDomain: "thirst", legacyQuestion: "How would you describe your thirst recently?", legacyNormal: "Normal, consistent", question: "How has your thirst been recently?", answers: [
    { id: "THIRST_VARIABLE", text: "It is irregular — sometimes I feel thirsty and sometimes I hardly notice thirst.", inventoryMatch: { domain: "thirst", symptom: "Variable, occasional" } },
    { id: "THIRST_HIGH", text: "I feel unusually thirsty or need to drink frequently.", inventoryMatch: { domain: "thirst", symptom: "Strong, frequent" } },
    { id: "THIRST_LOW_HEAVY", text: "I generally feel little thirst, especially when I also feel heavy or sluggish." },
    { id: "THIRST_NORMAL", text: "My thirst is normal and consistent.", normal: true },
  ] },
  { id: "Q7", legacyDomain: "sleep", legacyQuestion: "How would you describe your sleep recently?", legacyNormal: "Deep, restful", question: "Which option best describes your sleep over the last 7–14 days?", answers: [
    { id: "SLEEP_LIGHT_DISTURBED", text: "My sleep is light, irregular, or frequently disturbed.", inventoryMatch: { domain: "sleep", symptom: "Light, disturbed" } },
    { id: "SLEEP_LOW_HOT", text: "I sleep less than usual and often feel hot, restless, or irritable." },
    { id: "SLEEP_EXCESS_HEAVY", text: "I sleep for a long time or feel sleepy often, and still feel heavy or sluggish after waking.", inventoryMatch: { domain: "sleep", symptom: "Long, heavy" } },
    { id: "SLEEP_NORMAL", text: "My sleep is generally restful and normal for me.", normal: true },
  ] },
];

const parseJson = (content: string) => {
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); } catch { return null; }
};
const cleanText = (value: string, max = 320) => value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const normalizedStringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
const validSymptomAnswerIds = new Set(domainQuestions.flatMap((question) => question.answers.filter((answer) => !answer.normal).map((answer) => `${question.id}:${answer.id}`)));
const normalizedForSymptoms = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.flatMap((item) => {
  if (typeof item === "string") {
    const answerId = item.trim();
    return validSymptomAnswerIds.has(answerId) ? [answerId] : [];
  }
  if (!item || typeof item !== "object") return [];
  const legacy = item as Record<string, unknown>;
  if (typeof legacy.domain !== "string" || typeof legacy.symptom !== "string") return [];
  const legacyDomain = legacy.domain.trim();
  const legacySymptom = legacy.symptom.trim();
  const matchedAnswer = domainQuestions
    .flatMap((question) => question.answers.map((answer) => ({ question, answer })))
    .find(({ answer }) => answer.inventoryMatch?.domain === legacyDomain && answer.inventoryMatch?.symptom === legacySymptom);
  return matchedAnswer ? [`${matchedAnswer.question.id}:${matchedAnswer.answer.id}`] : [];
}))] : [];

function extractDomainAnswers(stored: unknown, conversation: unknown): Partial<Record<QuestionId, StoredQuestionnaireAnswer>> {
  const answers: Partial<Record<QuestionId, StoredQuestionnaireAnswer>> = {};
  const storedRecord = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : null;
  const nestedResponses = storedRecord?.responses && typeof storedRecord.responses === "object" && !Array.isArray(storedRecord.responses) ? storedRecord.responses as Record<string, unknown> : storedRecord;
  if (nestedResponses) {
    for (const question of domainQuestions) {
      const value = nestedResponses[question.id];
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const response = value as Record<string, unknown>;
      const answerId = typeof response.answer_id === "string" ? response.answer_id.trim() : "";
      const text = typeof response.text === "string" ? response.text.trim() : "";
      if (answerId && text) answers[question.id] = { answerId, text };
    }
  }
  if (storedRecord) {
    for (const question of domainQuestions) {
      if (answers[question.id] || !question.legacyDomain) continue;
      const value = storedRecord[question.legacyDomain];
      if (typeof value !== "string" || !value.trim()) continue;
      const legacyValue = value.trim();
      const mapped = question.answers.find((answer) => answer.inventoryMatch?.symptom.toLowerCase() === legacyValue.toLowerCase() || (answer.normal && question.legacyNormal?.toLowerCase() === legacyValue.toLowerCase()));
      if (mapped) answers[question.id] = { answerId: mapped.id, text: mapped.text };
    }
  }
  const messages = Array.isArray(conversation) ? conversation : [];
  for (const question of domainQuestions) {
    if (answers[question.id]) continue;
    const questionIndex = messages.findIndex((message) => message && typeof message === "object" && (message as Record<string, unknown>).role === "assistant" && ((message as Record<string, unknown>).content === question.question || (message as Record<string, unknown>).content === question.legacyQuestion));
    if (questionIndex < 0) continue;
    const response = messages.slice(questionIndex + 1).find((message) => message && typeof message === "object" && (message as Record<string, unknown>).role === "user" && typeof (message as Record<string, unknown>).content === "string");
    const content = response && typeof response === "object" ? (response as Record<string, unknown>).content : null;
    if (typeof content === "string") {
      const normalizedContent = content.trim().toLowerCase();
      const exactAnswer = question.answers.find((answer) => answer.text.toLowerCase() === normalizedContent || answer.inventoryMatch?.symptom.toLowerCase() === normalizedContent || (answer.normal && question.legacyNormal?.toLowerCase() === normalizedContent));
      if (exactAnswer) answers[question.id] = { answerId: exactAnswer.id, text: exactAnswer.text };
    }
  }
  return answers;
}

function validPlan(value: unknown, eligibleNames: Set<string>): value is SupplementPlan {
  if (!value || typeof value !== "object") return false;
  const recommendations = (value as Record<string, unknown>).recommendations;
  const minimumRecommendations = Math.min(2, eligibleNames.size);
  if (!Array.isArray(recommendations) || recommendations.length < minimumRecommendations || recommendations.length > Math.min(3, eligibleNames.size)) return false;
  const used = new Set<string>();
  for (const item of recommendations) {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.supplement !== "string" || !eligibleNames.has(candidate.supplement) || used.has(candidate.supplement)) return false;
    if (typeof candidate.reasoning !== "string" || !candidate.reasoning.trim()) return false;
    used.add(candidate.supplement);
  }
  return true;
}

const sanitizePlan = (plan: SupplementPlan): SupplementPlan => ({
  recommendations: plan.recommendations.map((item) => ({ supplement: item.supplement, reasoning: cleanText(item.reasoning) })),
});

const buildPrompt = (prakriti: string, vikruti: string, symptoms: string[], inventory: InventoryProduct[]) => `You are an Ayurvedic supplement recommendation assistant.

Your task is to recommend the most appropriate Ayurvedic supplements from the filtered supplement inventory provided by the backend.

IMPORTANT:
- Recommend ONLY supplements present in the provided filtered supplement inventory.
- Never invent, rename, substitute, or add a supplement that is not present in the inventory.
- Do not recommend dosage, frequency, treatment duration, or administration instructions.
- Do not make a medical diagnosis or claim that a supplement will cure or treat a disease.
- If there are not enough suitable supplements, return fewer recommendations rather than forcing a match.

### Inputs

Prakriti:
${prakriti}

Vikruti:
${vikruti}

Current symptoms:
${JSON.stringify(symptoms)}

Filtered supplement inventory:
${JSON.stringify(inventory.map((item) => ({
  name: item.name,
  primary_category: item.primary_category,
  for_symptoms: item.for_symptoms,
  pacifies: item.pacifies,
  may_aggravate: item.may_aggravate,
})))}

### Recommendation logic

Recommend 2–3 supplements that collectively address the largest number of the user's current symptoms.

Prioritize supplements that:
1. Match multiple current symptoms.
2. Align with the user's current Vikruti / imbalanced Dosha(s).
3. Are compatible with the user's Prakriti.
4. Have the strongest overall relevance based on the metadata provided in the supplement inventory.

The goal is NOT to recommend one supplement for every symptom. Identify 2–3 supplements that provide the best overall coverage while remaining appropriate for Vikruti and Prakriti. Avoid redundant recommendations when another available supplement provides broader coverage.

Use the supplied for_symptoms, pacifies, may_aggravate, primary_category, and any supplied safety metadata. Do not infer unsupported properties. Never select an item whose may_aggravate list contains one of the user's currently imbalanced Doshas. Do not override contraindications, interactions, or practitioner-review requirements.

For each selected supplement, provide a concise patient-facing explanation of why it is appropriate, which supplied symptoms it addresses, and how it relates to the Vikruti where relevant.

Return ONLY valid JSON in exactly this structure:
{
  "recommendations": [
    {
      "supplement": "Exact supplement name from inventory",
      "reasoning": "Concise explanation of why this supplement is recommended and which symptoms it addresses."
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
    if (!apiKey || !model || !supabaseUrl || !anonKey) throw new Error("Supplement recommendation service is not configured");

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
    if (!userResponse.ok) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user?.id) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "generate-supplements", 10, 86400);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The service is temporarily unavailable." : "Daily recommendation limit reached.", quota.unavailable ? 503 : 429);

    const assessmentResponse = await fetch(`${supabaseUrl}/rest/v1/current_health_assessments?select=id,user_id,symptoms,conclusion,vata_imbalanced,pitta_imbalanced,kapha_imbalanced,conversation,domain_answers&id=eq.${encodeURIComponent(assessmentId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { Authorization: authorization, apikey: anonKey } });
    const [assessment] = assessmentResponse.ok ? await assessmentResponse.json() : [];
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404, headers: corsHeaders });

    const prakritiResponse = suppliedPatient ? null : await fetch(`${supabaseUrl}/rest/v1/prakriti_assessments?select=vata_percentage,pitta_percentage,kapha_percentage&user_id=eq.${encodeURIComponent(user.id)}&order=completed_at.desc&limit=1`, { headers: { Authorization: authorization, apikey: anonKey } });
    const [storedPrakriti] = prakritiResponse?.ok ? await prakritiResponse.json() : [];
    const prakriti = suppliedPatient ? { vata_percentage: suppliedPrakriti[0], pitta_percentage: suppliedPrakriti[1], kapha_percentage: suppliedPrakriti[2] } : storedPrakriti;
    if (!prakriti) return Response.json({ error: "Complete the Prakriti assessment before generating supplement recommendations" }, { status: 409, headers: corsHeaders });

    const inventoryResponse = await fetch(`${supabaseUrl}/rest/v1/shop_products?select=id,name,primary_category,for_symptoms,pacifies,may_aggravate&active=eq.true&order=sort_order.asc`, { headers: { Authorization: authorization, apikey: anonKey } });
    const inventoryRows = inventoryResponse.ok ? await inventoryResponse.json() : [];
    const inventory: InventoryProduct[] = inventoryRows.flatMap((item: Record<string, unknown>) => typeof item.id === "string" && typeof item.name === "string" && typeof item.primary_category === "string" ? [{ id: item.id, name: item.name, primary_category: item.primary_category, for_symptoms: normalizedForSymptoms(item.for_symptoms), pacifies: normalizedStringArray(item.pacifies), may_aggravate: normalizedStringArray(item.may_aggravate) }] : []);

    const domainAnswers = extractDomainAnswers(assessment.domain_answers, assessment.conversation);
    const abnormalAnswers = domainQuestions.flatMap((question) => {
      const response = domainAnswers[question.id];
      if (!response) return [];
      const answer = question.answers.find((option) => option.id === response.answerId);
      return answer?.normal ? [] : [{ questionId: question.id, answerId: response.answerId, text: response.text, inventoryMatch: answer?.inventoryMatch }];
    });
    const inventoryMatches = new Set(abnormalAnswers.map((answer) => `${answer.questionId}:${answer.answerId}`).filter((answerId) => validSymptomAnswerIds.has(answerId)));
    const filteredInventory = inventory.filter((product) => product.for_symptoms.some((answerId) => inventoryMatches.has(answerId)));
    const imbalancedDoshas = [assessment.vata_imbalanced && "Vata", assessment.pitta_imbalanced && "Pitta", assessment.kapha_imbalanced && "Kapha"].filter(Boolean) as string[];
    const eligibleNames = new Set(filteredInventory.filter((product) => !product.may_aggravate.some((dosha) => imbalancedDoshas.includes(dosha))).map((product) => product.name));
    const symptoms = [...new Set([...normalizedStringArray(assessment.symptoms), ...abnormalAnswers.map((answer) => answer.text)])];
    const patientDetails = suppliedPatient ? [
      suppliedPatient.age !== null && suppliedPatient.age !== "" && Number.isFinite(Number(suppliedPatient.age)) ? `age ${Number(suppliedPatient.age)}` : null,
      ["male", "female", "other"].includes(suppliedPatient.gender) ? `gender ${suppliedPatient.gender}` : null,
      suppliedPatient.heightCm !== null && suppliedPatient.heightCm !== "" && Number.isFinite(Number(suppliedPatient.heightCm)) ? `height ${Number(suppliedPatient.heightCm)} cm` : null,
      suppliedPatient.weightKg !== null && suppliedPatient.weightKg !== "" && Number.isFinite(Number(suppliedPatient.weightKg)) ? `weight ${Number(suppliedPatient.weightKg)} kg` : null,
    ].filter(Boolean) : [];
    const prakritiText = `Vata ${prakriti.vata_percentage}%, Pitta ${prakriti.pitta_percentage}%, Kapha ${prakriti.kapha_percentage}%${patientDetails.length ? `; patient details: ${patientDetails.join(", ")}` : ""}`;
    const vikrutiText = assessment.conclusion || imbalancedDoshas.join("-") || "No clear Dosha imbalance identified";
    const prompt = buildPrompt(prakritiText, vikrutiText, symptoms, filteredInventory);

    const supplementProperty = eligibleNames.size ? { type: "string", enum: [...eligibleNames] } : { type: "string" };
    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "ayurnidaan_supplement_recommendations",
        strict: true,
        schema: {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              minItems: Math.min(2, eligibleNames.size),
              maxItems: eligibleNames.size ? Math.min(3, eligibleNames.size) : 0,
              items: { type: "object", properties: { supplement: supplementProperty, reasoning: { type: "string" } }, required: ["supplement", "reasoning"], additionalProperties: false },
            },
          },
          required: ["recommendations"],
          additionalProperties: false,
        },
      },
    };

    let plan: SupplementPlan | null = null;
    for (let attempt = 0; attempt < 3 && !plan; attempt += 1) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan Supplement Recommendations" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }], response_format: responseFormat, plugins: [{ id: "response-healing" }], max_tokens: 900 }),
      });
      if (!response.ok) {
        const providerError = (await response.text()).slice(0, 500);
        console.error("OpenRouter supplement request failed", response.status, providerError);
        if (response.status === 429) throw new Error("Supplement recommendations are temporarily rate-limited. Please try again shortly.");
        throw new Error(`Supplement recommendations are temporarily unavailable (${response.status}).`);
      }
      const data = await response.json();
      const parsed = parseJson(data.choices?.[0]?.message?.content?.trim() ?? "");
      if (validPlan(parsed, eligibleNames)) plan = sanitizePlan(parsed);
      else console.warn(`Rejected invalid supplement recommendations on attempt ${attempt + 1}`);
    }
    if (!plan) throw new Error("The AI model did not return valid supplement recommendations");

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/supplement_recommendation_plans?on_conflict=current_health_assessment_id`, {
      method: "POST",
      headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: user.id, current_health_assessment_id: assessment.id, prakriti, vikruti: vikrutiText, symptoms, domain_answers: { questionnaire_version: questionnaireVersion, responses: Object.fromEntries(Object.entries(domainAnswers).map(([questionId, answer]) => [questionId, { answer_id: answer?.answerId, text: answer?.text }])) }, filtered_inventory: filteredInventory, recommendations: plan, model, updated_at: new Date().toISOString() }),
    });
    if (!saveResponse.ok) {
      console.error("Supplement recommendation save failed", saveResponse.status, (await saveResponse.text()).slice(0, 500));
      throw new Error("The supplement recommendations were generated but could not be saved");
    }
    return Response.json({ ...plan, filteredInventoryCount: filteredInventory.length }, { headers: corsHeaders });
  } catch (error) {
    console.error("Supplement recommendation generation failed", error instanceof Error ? error.message : "Unexpected error");
    return publicError(corsHeaders, "Supplement recommendations are temporarily unavailable.");
  }
});
