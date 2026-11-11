import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gunaPrompt, gunaSchema, validGunaResult, scoreGunas } from './guna.ts';
import { complaintClassificationPrompt, complaintClassificationSchema, validComplaintClassification, normalizeComplaintClassification } from './complaints.ts';
import { consumeRateLimit, corsHeadersFor, publicError } from "../_shared/security.ts";

const isSafetyClassifierReply = (content: string) =>
  content.replace(/[^a-z]+/gi, " ").trim().toLowerCase() === "user safety safe response safety safe";
type QuestionPayload = { question: string; options: string[] };
type ChatMessage = { role: "user" | "assistant"; content: string };
type VikritiDosha = "Vata" | "Pitta" | "Kapha";
type DoshaFinding = { dosha: VikritiDosha; symptoms: string[]; reasoning: string };
type ConclusionPayload = { imbalanced_doshas: DoshaFinding[] };
const parseStructuredReply = (content: string) => {
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); } catch { return null; }
};
const isQuestionPayload = (value: unknown): value is QuestionPayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.question === "string" && candidate.question.trim().length > 0 &&
    Array.isArray(candidate.options) && candidate.options.length >= 2 && candidate.options.length <= 3 &&
    candidate.options.every((option) => typeof option === "string" && option.trim().length > 0) &&
    new Set(candidate.options.map((option) => String(option).trim().toLowerCase())).size === candidate.options.length;
};
const normalizeQuestion = (question: string) => `${question.trim().replace(/[.!?]+$/, "")}?`;
const isConclusionPayload = (value: unknown): value is ConclusionPayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const findings = candidate.imbalanced_doshas;
  if (!Array.isArray(findings) || findings.length > 3) return false;
  const valid = findings.every((finding) => {
    if (!finding || typeof finding !== "object") return false;
    const item = finding as Record<string, unknown>;
    return (item.dosha === "Vata" || item.dosha === "Pitta" || item.dosha === "Kapha") &&
      Array.isArray(item.symptoms) && item.symptoms.length > 0 &&
      item.symptoms.every((symptom) => typeof symptom === "string" && symptom.trim().length > 0) &&
      typeof item.reasoning === "string" && item.reasoning.trim().length > 0;
  });
  return valid && new Set(findings.map((finding) => (finding as DoshaFinding).dosha)).size === findings.length;
};

const buildFollowUpPrompt = (prakriti: string, previousQuestion: string, patientResponse: string, chatHistory: string, targetSymptom: string, followUpNumber: number) => `You are assisting in a clinical assessment of an individual's Vikruti (current Dosha imbalance).

Your task is ONLY to generate the next relevant follow-up question based on the patient's latest response.

Assessment context:

- Intention: Assess the individual's Vikruti.
- Prakriti: ${prakriti}
${chatHistory ? `- Opening complaint conversation so far:\n  ${chatHistory}\n` : ""}- Previous question: ${previousQuestion}
- Patient's response: ${patientResponse}
${targetSymptom ? `- Opening symptom currently being clarified: ${targetSymptom}\n- Follow-up number for this symptom: ${followUpNumber} of 2\n` : ""}

Instructions:

1. Ask exactly ONE concise follow-up question.
2. ${targetSymptom ? `Focus only on clarifying "${targetSymptom}". Ask about a clinically relevant characteristic not already established in the conversation.` : "The question should clarify or expand upon the patient's latest response."}
3. Focus only on information relevant to assessing the individual's current state.
4. Do not diagnose or state which Dosha is involved.
5. Do not explain the reasoning behind the question.
6. Do not repeat information already provided by the patient.
7. Provide 3 concise answer options that are appropriate for the question.
8. Options should be mutually distinguishable and easy for the patient to understand.
9. Do not make the options explicitly mention Vata, Pitta, or Kapha.
10. If the patient's response does not require meaningful clarification, ask the most clinically relevant question related to the response.

Output ONLY valid JSON in this format:

{
"question": "Your follow-up question",
"options": [
"Option 1",
"Option 2",
"Option 3"
]
}`;

const buildFinalPrompt = (prakriti: string, chatHistory: string) => `You are assisting in the clinical assessment of an individual's Vikruti (current Dosha imbalance).

Your task is to assess the patient's current state using their Prakriti and the complete assessment conversation.

Assessment context:

- Intention: Assess the individual's Vikruti.
- Prakriti: ${prakriti}
- Complete assessment conversation:
  ${chatHistory}

Instructions:

1. Analyze the patient's symptoms and responses across the assessment.
2. Consider the individual's Prakriti when interpreting the symptoms.
3. Identify which Dosha(s), if any, appear to be imbalanced.
4. Base your assessment ONLY on information present in the conversation.
5. Distinguish current symptoms from statements describing the individual's normal or longstanding baseline.
6. Do not assume that every Dosha must be imbalanced.
7. If the available evidence is insufficient to support a Dosha imbalance, state that clearly.
8. Identify the specific symptoms or observations supporting each identified imbalance.
9. Provide concise reasoning explaining how the symptoms support the assessment.
10. Do not recommend treatment, medication, Panchakarma, diet, or lifestyle changes.
11. Do not invent symptoms or clinical information that is not present in the conversation.

Output ONLY valid JSON in this format:

{
"imbalanced_doshas": [
{
"dosha": "Vata",
"symptoms": [
"Symptom 1",
"Symptom 2"
],
"reasoning": "Concise explanation of why the available evidence suggests this imbalance."
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
    const mode = body.mode === "final" ? "final" : body.mode === "classify_complaints" ? "classify_complaints" : "follow_up";
    const useGunas = mode === 'final' && body.assessmentMethod === 'guna-v1';
    const previousQuestion = typeof body.previousQuestion === "string" ? body.previousQuestion.trim().slice(0, 4000) : "";
    const patientResponse = typeof body.patientResponse === "string" ? body.patientResponse.trim().slice(0, 4000) : "";
    const targetSymptom = typeof body.targetSymptom === "string" ? body.targetSymptom.trim().slice(0, 500) : "";
    const followUpNumber = body.followUpNumber === 2 ? 2 : 1;
    const suppliedPatient = body.patientContext && typeof body.patientContext === "object" ? body.patientContext : null;
    const suppliedPrakriti = suppliedPatient ? ["vataPercentage", "pittaPercentage", "kaphaPercentage"].map((key) => Number(suppliedPatient[key])) : [];
    if (suppliedPatient && (suppliedPrakriti.some((value) => !Number.isFinite(value) || value < 0 || value > 100) || suppliedPrakriti.reduce((sum, value) => sum + value, 0) !== 100)) {
      return Response.json({ error: "Patient Prakriti percentages must be valid and total 100%" }, { status: 400, headers: corsHeaders });
    }
    if (mode === "follow_up" && (!previousQuestion || !patientResponse)) {
      return Response.json({ error: "The previous question and patient response are required" }, { status: 400, headers: corsHeaders });
    }
    if (mode === "classify_complaints" && !patientResponse) {
      return Response.json({ error: "The patient's opening complaint is required" }, { status: 400, headers: corsHeaders });
    }
    const incomingMessages: unknown[] = Array.isArray(body.messages) ? body.messages : [];
    const messages = incomingMessages
      .filter((message: unknown): message is ChatMessage => Boolean(message && typeof message === "object" && (((message as ChatMessage).role === "user") || ((message as ChatMessage).role === "assistant")) && typeof (message as ChatMessage).content === "string"))
      .slice(-100)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));
    if (mode === "final" && !messages.length) {
      return Response.json({ error: "The complete assessment conversation is required" }, { status: 400, headers: corsHeaders });
    }
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_MODEL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!apiKey || !model || !supabaseUrl || !anonKey) throw new Error("Assessment service is not configured");
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
    if (!userResponse.ok) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user?.id) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const quota = await consumeRateLimit(supabaseUrl, anonKey, authorization, "current-health-chat", 60, 3600);
    if (!quota.allowed) return publicError(corsHeaders, quota.unavailable ? "The service is temporarily unavailable." : "Assessment limit reached. Please try again later.", quota.unavailable ? 503 : 429);

    const prakritiResponse = await fetch(`${supabaseUrl}/rest/v1/prakriti_assessments?select=vata_percentage,pitta_percentage,kapha_percentage&user_id=eq.${encodeURIComponent(user.id)}&order=completed_at.desc&limit=1`, {
      headers: { Authorization: authorization, apikey: anonKey },
    });
    const [prakriti] = prakritiResponse.ok ? await prakritiResponse.json() : [];
    const prakritiDescription = suppliedPatient
      ? `Vata ${suppliedPrakriti[0]}%, Pitta ${suppliedPrakriti[1]}%, Kapha ${suppliedPrakriti[2]}%`
      : prakriti
        ? `Vata ${prakriti.vata_percentage}%, Pitta ${prakriti.pitta_percentage}%, Kapha ${prakriti.kapha_percentage}%`
        : "Not available";
    const optionalDetails = suppliedPatient ? [
      suppliedPatient.age !== null && suppliedPatient.age !== "" && Number.isFinite(Number(suppliedPatient.age)) ? `age ${Number(suppliedPatient.age)}` : null,
      ["male", "female", "other"].includes(suppliedPatient.gender) ? `gender ${suppliedPatient.gender}` : null,
      suppliedPatient.heightCm !== null && suppliedPatient.heightCm !== "" && Number.isFinite(Number(suppliedPatient.heightCm)) ? `height ${Number(suppliedPatient.heightCm)} cm` : null,
      suppliedPatient.weightKg !== null && suppliedPatient.weightKg !== "" && Number.isFinite(Number(suppliedPatient.weightKg)) ? `weight ${Number(suppliedPatient.weightKg)} kg` : null,
    ].filter(Boolean) : [];
    const prakritiContext = `${prakritiDescription}${optionalDetails.length ? `; patient details: ${optionalDetails.join(", ")}` : ""}`;
    const chatHistory = messages.map((message) => `${message.role === "assistant" ? "Assessment" : "Patient"}: ${message.content}`).join("\n  ");
    const prompt = mode === "final"
      ? (useGunas ? gunaPrompt(prakritiContext, chatHistory) : buildFinalPrompt(prakritiContext, chatHistory))
      : mode === "classify_complaints"
        ? complaintClassificationPrompt(patientResponse)
        : buildFollowUpPrompt(prakritiContext, previousQuestion, patientResponse, chatHistory, targetSymptom, followUpNumber);

    const responseFormat = mode === "classify_complaints"
      ? complaintClassificationSchema
      : mode === "final"
      ? {
          type: "json_schema",
          json_schema: {
            name: "ayurnidaan_vikriti_conclusion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                imbalanced_doshas: {
                  type: "array",
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      dosha: { type: "string", enum: ["Vata", "Pitta", "Kapha"] },
                      symptoms: { type: "array", minItems: 1, items: { type: "string" } },
                      reasoning: { type: "string" },
                    },
                    required: ["dosha", "symptoms", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["imbalanced_doshas"],
              additionalProperties: false,
            },
          },
        }
      : {
          type: "json_schema",
          json_schema: {
            name: "ayurnidaan_assessment_question",
            strict: true,
            schema: {
              type: "object",
              properties: {
                question: { type: "string", description: "Exactly one concise assessment question." },
                options: { type: "array", minItems: 3, maxItems: 3, description: "Exactly three concise, distinct answer options.", items: { type: "string" } },
              },
              required: ["question", "options"],
              additionalProperties: false,
            },
          },
        };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Ayurnidaan Current Health Assessment" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: prompt }],
          response_format: useGunas ? gunaSchema : responseFormat,
          plugins: [{ id: "response-healing" }],
        }),
      });
      if (!response.ok) {
        const providerError = (await response.text()).slice(0, 500);
        console.error("OpenRouter request failed", response.status, providerError);
        if (response.status === 429) throw new Error("The AI model is temporarily rate-limited. Please try again shortly.");
        throw new Error(`The assessment AI is temporarily unavailable (${response.status}). Please try again.`);
      }
      const data = await response.json();
      const rawReply = data.choices?.[0]?.message?.content?.trim() ?? "";
      const parsedReply = parseStructuredReply(rawReply);
      const validReply = mode === "classify_complaints"
        ? validComplaintClassification(parsedReply)
        : mode === "final"
        ? (useGunas ? validGunaResult(parsedReply) : isConclusionPayload(parsedReply))
        : isQuestionPayload(parsedReply);
      if (!isSafetyClassifierReply(rawReply) && validReply) {
        if (mode === "classify_complaints" && validComplaintClassification(parsedReply)) {
          return Response.json({ classification: normalizeComplaintClassification(parsedReply) }, { headers: corsHeaders });
        }
        if (mode === "final") {
          if (useGunas && validGunaResult(parsedReply)) return Response.json({ assessment: scoreGunas(parsedReply) }, { headers: corsHeaders });
          const conclusion = parsedReply as ConclusionPayload;
          const sanitized = {
            imbalanced_doshas: conclusion.imbalanced_doshas.map((finding) => ({
              dosha: finding.dosha,
              symptoms: finding.symptoms.map((symptom) => symptom.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim()),
              reasoning: finding.reasoning.replace(/\s+/g, " ").trim(),
            })),
          };
          return Response.json({ assessment: sanitized }, { headers: corsHeaders });
        }
        const question = parsedReply as QuestionPayload;
        return Response.json({ reply: normalizeQuestion(question.question), options: question.options.map((option) => option.trim()) }, { headers: corsHeaders });
      }
      console.warn(`Rejected invalid assessment reply on attempt ${attempt + 1}`);
    }
    throw new Error("The AI model did not return the required assessment format. Please try again.");
  } catch (error) {
    console.error("Current health assessment failed", error instanceof Error ? error.message : "Unexpected error");
    return publicError(corsHeaders, "The assessment service is temporarily unavailable.");
  }
});
