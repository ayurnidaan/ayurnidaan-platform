import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";

const isSafetyClassifierReply = (content: string) => content.replace(/[^a-z]+/gi, " ").trim().toLowerCase() === "user safety safe response safety safe";
const redFlagPatterns = [
  /\b(chest pain|chest pressure|chest tightness)\b/i,
  /\b(can(?:not|'t) breathe|severe shortness of breath|struggling to breathe|choking)\b/i,
  /\b(face droop|one[- ]sided weakness|slurred speech|signs? of (?:a )?stroke)\b/i,
  /\b(fainted|fainting|unconscious|unresponsive|seizure)\b/i,
  /\b(severe bleeding|bleeding heavily|vomiting blood|coughing blood|black tarry stool)\b/i,
  /\b(anaphylaxis|throat (?:is )?swelling|swollen tongue)\b/i,
  /\b(overdose|poisoning|suicidal|suicide|kill myself|self[- ]harm)\b/i,
  /\b(sudden (?:worst|severe) headache|worst headache of my life)\b/i,
];
const containsRedFlag = (text: string) => redFlagPatterns.some((pattern) => pattern.test(text));
const RED_FLAG_REPLY = "AYURNIDAAN_RED_FLAG_DETECTED";
const SAFE_REPLY = "AYURNIDAAN_NO_RED_FLAG";
type ChatMessage = { role: "user" | "assistant"; content: string };
const sanitiseAIReply = (content: string) => content
  .replace(/\u2014/g, ", ")
  .replace(/#/g, "")
  .replace(/\*/g, "")
  .replace(/`/g, "")
  .replace(/_{2,}/g, "")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/[ \t]{2,}/g, " ")
  .replace(/,\s*,+/g, ",")
  .trim();
const classifyRedFlag = async (apiKey: string, model: string, text: string) => {
  const prompt = `You are a medical safety classifier. Decide whether the user's latest message describes a potential emergency or urgent red flag where an Ayurveda wellness chatbot must stop and direct the user to a doctor or emergency services. Red flags include chest pain or pressure, severe breathing difficulty, stroke signs, fainting or unconsciousness, seizures, severe bleeding, anaphylaxis, overdose or poisoning, suicidal intent or self-harm, and sudden severe headache. Do not classify routine or mild symptoms as red flags. Return exactly one string and nothing else: ${RED_FLAG_REPLY} or ${SAFE_REPLY}.`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan Safety Check" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, { role: "user", content: text }], temperature: 0, max_tokens: 20 }),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const result = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (result === RED_FLAG_REPLY) return true;
      if (result === SAFE_REPLY) return false;
    } catch {
      // A classifier outage must not block a normal wellness conversation.
    }
  }
  return null;
};
const ageFromDateOfBirth = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
};

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
    const body = await request.json();
    const incomingMessages: unknown[] = Array.isArray(body.messages) ? body.messages : [];
    const messages = incomingMessages
      .filter((message: unknown): message is ChatMessage => Boolean(message && typeof message === "object" && (((message as ChatMessage).role === "user") || ((message as ChatMessage).role === "assistant")) && typeof (message as ChatMessage).content === "string"))
      .slice(-40)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));
    if (!messages.length) return Response.json({ error: "A chat message is required" }, { status: 400, headers: corsHeaders });
    const newestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_MODEL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!apiKey || !model || !supabaseUrl || !anonKey) throw new Error("AI chat service is not configured");
    const requestHeaders = { Authorization: authorization, apikey: anonKey };
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: requestHeaders });
    if (!userResponse.ok) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user?.id) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "ai-chat", 30, 3600);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The service is temporarily unavailable." : "AI chat limit reached. Please try again later.", quota.unavailable ? 503 : 429);
    const llmDetectedRedFlag = await classifyRedFlag(apiKey, model, newestUserMessage);
    if (llmDetectedRedFlag === true || containsRedFlag(newestUserMessage)) {
      return Response.json({ red_flag: true, reply: RED_FLAG_REPLY, safety_code: RED_FLAG_REPLY }, { headers: corsHeaders });
    }
    const userId = encodeURIComponent(user.id);
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=date_of_birth,height_cm,weight_kg,ai_context_enabled&user_id=eq.${userId}&limit=1`, { headers: requestHeaders });
    const [profile] = profileResponse.ok ? await profileResponse.json() : [];
    const storedContextAllowed = profile?.ai_context_enabled === true;
    const [prakritiResponse, vikritiResponse] = storedContextAllowed ? await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/prakriti_assessments?select=vata_percentage,pitta_percentage,kapha_percentage&user_id=eq.${userId}&order=completed_at.desc&limit=1`, { headers: requestHeaders }),
      fetch(`${supabaseUrl}/rest/v1/current_health_assessments?select=conclusion,symptoms,vata_imbalanced,pitta_imbalanced,kapha_imbalanced&user_id=eq.${userId}&order=completed_at.desc&limit=1`, { headers: requestHeaders }),
    ]) : [null, null];
    const [prakriti] = prakritiResponse?.ok ? await prakritiResponse.json() : [];
    const [vikriti] = vikritiResponse?.ok ? await vikritiResponse.json() : [];
    const prakritiText = prakriti ? `Vata ${prakriti.vata_percentage}%, Pitta ${prakriti.pitta_percentage}%, Kapha ${prakriti.kapha_percentage}%` : "Not available";
    const imbalancedDoshas = vikriti ? [vikriti.vata_imbalanced && "Vata", vikriti.pitta_imbalanced && "Pitta", vikriti.kapha_imbalanced && "Kapha"].filter(Boolean) : [];
    const vikritiText = vikriti ? (imbalancedDoshas.length ? imbalancedDoshas.join(", ") : vikriti.conclusion || "No imbalance identified") : "Not available";
    const symptoms = Array.isArray(vikriti?.symptoms) ? vikriti.symptoms.filter((item: unknown) => typeof item === "string").join(", ") : "Not available";
    const age = ageFromDateOfBirth(profile?.date_of_birth);
    const optionalContext = storedContextAllowed ? [
      age !== null ? `Age: ${age}` : null,
      Number.isFinite(Number(profile.height_cm)) ? `Height: ${Number(profile.height_cm)} cm` : null,
      Number.isFinite(Number(profile.weight_kg)) ? `Weight: ${Number(profile.weight_kg)} kg` : null,
    ].filter(Boolean) : [];
    const storedContext = storedContextAllowed ? `\nThe user has enabled stored health context.\nPrakriti: ${prakritiText}\nVikriti: ${vikritiText}\nSymptoms: ${symptoms}${optionalContext.length ? `\nProfile context:\n${optionalContext.join("\n")}` : ""}` : "\nThe user has not enabled stored health context. Respond only to information in this conversation.";
    const systemPrompt = `You are AI Vaidya, an Ayurveda wellness education assistant. Every answer must be rooted in the traditional Ayurvedic framework while remaining clear about its limits.

Ayurvedic foundation:
1. Begin with the user's stated concern and use their Prakriti, Vikriti and symptoms only when that context is available and consented to.
2. Explain the concern through relevant Ayurvedic concepts such as Dosha, Guna, Agni, Ama, Srotas, Dinacharya, Ritucharya, Ahara and Vihara. Use only concepts that genuinely help answer the question.
3. Prioritize gentle, low-risk food and lifestyle guidance. When appropriate, include meal timing, food qualities, daily routine, sleep routine, seasonal adjustments, yoga or pranayama.
4. Personalize suggestions to the available Prakriti and Vikriti context. Never infer a Dosha imbalance from too little information. Ask one concise follow-up question when essential context is missing.
5. Present Ayurvedic concepts as the traditional Ayurvedic view, not as proven biomedical facts. Do not invent classical quotations, research findings, assessment results or details about the user.

Response format:
1. Return plain text only.
2. Do not use Markdown, hashtags, asterisks, bold markers, backticks, tables or the em dash character.
3. Use short paragraphs. When steps are useful, use simple numbered lines such as 1. 2. 3.
4. Keep the answer concise, practical, warm and specific to the question. Explain unfamiliar Sanskrit terms in plain language the first time they appear.

Safety boundaries:
1. Provide wellness education only. Do not diagnose, prescribe medicines or herbs, specify therapeutic dosages, or claim to prevent or cure disease.
2. Do not tell the user to stop or replace prescribed care. Recommend a qualified clinician for persistent, worsening, severe or unclear symptoms and for herbs, supplements, Panchakarma or other supervised therapies.
3. If the user describes a potential emergency, stop wellness guidance and direct them to emergency care.
4. Do not invent missing details.${storedContext}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, ...messages], temperature: 0.4 }),
      });
      if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`);
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!isSafetyClassifierReply(reply)) return Response.json({ reply: sanitiseAIReply(reply) || "I could not prepare a response. Please try again." }, { headers: corsHeaders });
      console.warn(`Rejected safety-classifier reply on attempt ${attempt + 1}`);
    }
    throw new Error("The AI service could not prepare a response. Please try again.");
  } catch (error) {
    console.error("AI chat failed", error instanceof Error ? error.message : "Unexpected error");
    return publicError(corsHeaders, "AI chat is temporarily unavailable.");
  }
});
