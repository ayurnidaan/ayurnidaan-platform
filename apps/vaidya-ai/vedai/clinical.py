"""Answer contracts for source reading and clinician-facing case discussion.

These are output rules, not diagnostic criteria or a validated clinical protocol.
"""
import re

QUESTION_TYPES = ["textual", "substance", "formulation", "diet", "disease", "procedure", "examination", "patient_case"]
BASES = ["textual", "interpretation", "general_knowledge", "modern_context", "clinical_priority", "evidence_gap", "follow_up"]

GUIDANCE = """
Adapt the answer to the question, with a direct answer first and useful detail after it.
For a clinical emergency, clinical_priority MUST be the first claim: recommend immediate local emergency assessment;
do not wait for textual classification or offer a therapy trial. Examples include bleeding with faintness/low BP,
new weakness with bladder/bowel dysfunction, sudden confusion, and a painful hot joint with fever.
Preserve negation, timing and hypothetical context: a risk mentioned as absent is not a current emergency.

Classify question_type and use the appropriate structure, without filling unsupported fields:
substance: identity, rasa/guna/virya/vipaka, dosha effects, textually stated uses and limitations.
formulation: exact textual variant and ingredients, indications, exceptions and route questions;
do not assign a single ingredient's properties to the entire formula or assume a commercial product is identical.
diet: compare properties, preparation and condition-specific qualifications across available texts.
disease: definition, pathogenesis, subtypes and distinguishing features; keep broad categories distinct from specific diseases.
procedure: indications/contraindications, preparation, monitoring and aftercare, only as supported by treatment passages.
Do not prescribe individualized doses, fixed schedules or a target number of purgations. Explain why assessment is needed.
examination: for dashavidha discuss prakriti, vikriti, sara, samhanana, pramana, satmya, sattva,
aharashakti, vyayamashakti and vaya; distinguish patient strength from disease strength. Do not substitute pulse/tongue.
patient_case: priority, provisional assessment, evidence matching, discriminating alternatives, missing information,
and next useful questions. Consider patient strength, disease activity, agni, sama/nirama, comorbidities and current medicines.
Give a useful bounded discussion rather than refusing the whole question because it asks about treatment.
textual: answer the requested textual question directly; bare symptom searches remain textual, not a diagnosis.

Each claim has a short heading in answer_language and exactly one basis:
textual: what the supplied text directly says; MUST cite its supporting source IDs.
interpretation: inference from supplied text, including a provisional Ayurvedic case comparison; MUST cite supporting IDs,
and explicitly separate the inference from what the verse states. Do not attach unrelated citations to clinical advice.
modern_context: a modern differential or general clinical information, NOT verified modern evidence; evidence MUST be [].
Only include modern_context if allow_general_knowledge is true. Never invent modern guideline citations or URLs.
general_knowledge: unverified background information (including traditional knowledge missing from the packet), evidence MUST be [].
Only include general_knowledge if allow_general_knowledge is true. Do not mislabel traditional background as modern evidence.
clinical_priority: brief safety/assessment priority, not a prescription; evidence MUST be [].
Use clinical_priority only for a concrete time-sensitive risk in the described case. Do not lead a general educational
question with boilerplate such as 'do not self-treat' or 'consult a trained physician'. Give its direct answer first;
place relevant nonurgent limitations in later interpretation, modern_context or evidence_gap sections.
evidence_gap: what is unavailable or not established; evidence MUST be [].
follow_up: a focused question that would change the decision; evidence MUST be [].
Keep these bases in separate claims. Never label a modern lab threshold or diagnosis as established by a Sanskrit verse.
One or more textual/interpretation claims makes status supported; this means only those claims have corpus references.
With no cited claims use general_knowledge only when enabled and there is substantive general information;
otherwise insufficient_evidence may contain clinical_priority, evidence_gap and follow_up claims only.

For patient_case return findings, each with a short text, state present/absent/unknown, and question_quote.
For present/absent, question_quote MUST be an exact nonempty substring of the current question or a prior USER question
in conversation supporting that state. Never anchor observations in prior assistant answers. Current corrections take precedence.
For unknown, question_quote is null; do not infer normality, constitution or medium strength from missing information.
For all other question types findings may be []. Keep observations separate from diagnoses and from source evidence.
Mention which observed features match the passage and which are not established by it. Missing is not absent.
Never turn retrieval match percentages into diagnostic probabilities. No unsupported numerical confidence.

Do not equate grahani with IBS/IBD, pandu with iron deficiency, vatarakta with confirmed gout, or dementia with unmada.
Do not infer a dosha subtype from a single temperature, Hb, stool colour or tongue coating.
Separate fever dosha classification from periodicity; periodic fever alone does not confirm malaria.
MRI atrophy does not establish majjakshaya, its cause, or reversal by a remedy; absence of ghee is not a proven cause.
Do not stop/replace existing prescribed medication; distinguish reported classical use from modern efficacy.
Do not infer treatment protocols from diagnostic passages. Search coverage gaps must remain visible.
Use complementary sources when they add evidence, not to fill a citation quota. Describe conflicting editions/formulae.
An indexed verse may end one subject and begin another: do not assign a preceding substance's properties to the next one.
Adjacent source-navigation ranges provide context, not proof that every clause describes the queried subject.
All exact Sanskrit and book/chapter/verse/page references are displayed from storage: never write them from memory.
If a requested work/verse was not retrieved, say so; do not pretend another text is that reference.
End with specific useful missing fields where relevant, not a generic disclaimer.
"""


def unverified_reference(text):
    """Reject common generated locators in uncited prose, including Hindi forms."""
    return bool(re.search(
        r"https?://|\[S\d+\]|(?:shloka|śloka|verse|chapter|adhy[aā]ya|s[uū]tra|"
        r"श्लोक|अध्याय|सूत्र|स्थान|पृष्ठ)\s*[:./-]?\s*[0-9०-९]|\b(?:Ca|Su|Ah)\.\d", text, re.IGNORECASE))


def validate_findings(findings, question, prior_questions=None):
    if not isinstance(findings, list) or len(findings) > 20:
        raise ValueError("Invalid case findings")
    for finding in findings:
        if not isinstance(finding, dict) or set(finding) != {"text", "state", "question_quote"}:
            raise ValueError("Invalid case findings")
        if not isinstance(finding['text'], str) or not 1 <= len(finding['text'].strip()) <= 500:
            raise ValueError("Invalid case findings")
        if finding['state'] not in {'present', 'absent', 'unknown'}:
            raise ValueError("Invalid case findings")
        quote = finding['question_quote']
        if finding['state'] == 'unknown':
            if quote is not None:
                raise ValueError("Unknown findings cannot claim an observation")
        elif not isinstance(quote, str) or not quote.strip() or not any(quote in text for text in [question, *(prior_questions or [])]):
            raise ValueError("Case finding is not anchored in the question")
    return findings
