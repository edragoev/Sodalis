import { GoogleGenAI, Type } from "@google/genai";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { QUESTIONS, QUESTION_KEYS, type QuestionKey } from "@/lib/profile-questions";
import { parseLogistics } from "@/lib/logistics";

export { QUESTIONS, QUESTION_KEYS };
export type { QuestionKey };

export type Constraints = { can_drive: boolean | null; travel_minutes: number | null; notes: string | null };
type Structured = {
  interests: string[];
  activities_with_elder: string[];
  skills: string[];
  conversation_topics: string[];
  constraints: Constraints;
  summary: string;
};

// Which answers feed which stored column. Manual tag edits survive a re-run
// unless one of the related answers changed.
const FIELD_SOURCES: Record<string, QuestionKey[]> = {
  activities_with_elder: ["with_elder", "wish"],
  interests: ["interests"],
  skills: ["skills"],
  conversation_topics: ["talk_about"],
  constraints: ["logistics"],
};

const schema = {
  type: Type.OBJECT,
  properties: {
    interests: { type: Type.ARRAY, items: { type: Type.STRING } },
    activities_with_elder: { type: Type.ARRAY, items: { type: Type.STRING } },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    conversation_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
    constraints: {
      type: Type.OBJECT,
      properties: {
        can_drive: { type: Type.BOOLEAN, nullable: true },
        travel_minutes: { type: Type.NUMBER, nullable: true },
        notes: { type: Type.STRING, nullable: true },
      },
      required: ["can_drive", "travel_minutes", "notes"],
    },
    summary: { type: Type.STRING },
  },
  required: ["interests", "activities_with_elder", "skills", "conversation_topics", "constraints", "summary"],
};

const clean = (tags: string[]) =>
  [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);

async function structure(answers: Record<string, string>): Promise<Structured> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) throw new Error("Gemini env vars are not set");

  // The SDK's default is 5 attempts with waits of up to 60 s. On the free tier a refused call (429)
  // would then take minutes, so allow one quick retry and a hard cap.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000, retryOptions: { attempts: 2 } } });
  const body = QUESTIONS.filter((q) => answers[q.key])
    .map((q) => `Q: ${q.text}\nA: ${answers[q.key]}`)
    .join("\n\n");

  const res = await ai.models.generateContent({
    model,
    contents:
      "A family member described how they connect with an elderly relative. Extract structured tags. " +
      "Tags are lowercase, short nouns or verbs (e.g. cooking, gardening, driving). " +
      "Only include what the person actually said. Do not infer. " +
      "activities_with_elder covers things they do or wish to do together. summary is one friendly sentence.\n\n" +
      body,
    config: { responseMimeType: "application/json", responseSchema: schema },
  });
  const parsed = JSON.parse(res.text ?? "") as Structured;
  return {
    interests: clean(parsed.interests ?? []),
    activities_with_elder: clean(parsed.activities_with_elder ?? []),
    skills: clean(parsed.skills ?? []),
    conversation_topics: clean(parsed.conversation_topics ?? []),
    constraints: parsed.constraints ?? { can_drive: null, travel_minutes: null, notes: null },
    summary: parsed.summary ?? "",
  };
}

export type StructureResult = "ok" | "failed" | "skipped";

const inFlight = new Set<string>(); // a member being structured right now (this server instance)
const retryAfter = new Map<string, number>(); // after a failure, wait before asking Gemini again
const COOLDOWN_MS = 60_000;

/** The answers that changed since the last successful structuring (empty when nothing is pending). */
async function pendingChanges(memberId: string) {
  const db = supabaseAdmin();
  const [{ data: rows }, { data: member }] = await Promise.all([
    db.from("member_profile_answers").select("question_key, answer_text, updated_at").eq("member_id", memberId),
    db.from("family_members").select("profile_updated_at").eq("id", memberId).single(),
  ]);
  const answers = (rows ?? []).filter((r) => r.answer_text?.trim());
  const since = member?.profile_updated_at ? new Date(member.profile_updated_at).getTime() : 0;
  const changed = new Set(answers.filter((r) => new Date(r.updated_at).getTime() > since).map((r) => r.question_key));
  return { answers, changed };
}

export async function hasPendingStructuring(memberId: string): Promise<boolean> {
  return (await pendingChanges(memberId)).changed.size > 0;
}

/**
 * Re-run Gemini for a member and write back only the fields whose source answers
 * changed since the last structuring. Never throws: on failure the answers stay
 * saved and a later profile view retries (not more than once a minute).
 */
export async function restructureMember(memberId: string): Promise<StructureResult> {
  if (inFlight.has(memberId)) return "skipped";
  if ((retryAfter.get(memberId) ?? 0) > Date.now()) return "failed";

  const { answers, changed } = await pendingChanges(memberId);
  if (!changed.size) return "skipped";

  inFlight.add(memberId);
  try {
    const db = supabaseAdmin();
    const result = await structure(Object.fromEntries(answers.map((r) => [r.question_key, r.answer_text])));
    const update: Record<string, unknown> = { profile_summary: result.summary, profile_updated_at: new Date().toISOString() };
    // Constraints chosen with the logistics taps are exact and saved when the answer is saved;
    // Gemini only fills them in for older free-text answers.
    const logistics = answers.find((r) => r.question_key === "logistics")?.answer_text ?? "";
    const exactConstraints = !!logistics.trim() && !!parseLogistics(logistics);
    for (const [field, sources] of Object.entries(FIELD_SOURCES)) {
      if (field === "constraints" && exactConstraints) continue;
      if (sources.some((k) => changed.has(k))) update[field] = result[field as keyof Structured];
    }
    const { error } = await db.from("family_members").update(update).eq("id", memberId);
    if (error) throw error;
    retryAfter.delete(memberId);
    return "ok";
  } catch (e) {
    retryAfter.set(memberId, Date.now() + COOLDOWN_MS);
    console.error("profile structuring failed", e instanceof Error ? e.message : e);
    return "failed";
  } finally {
    inFlight.delete(memberId);
  }
}

/** Build the tags after the response has been sent, so saving never waits on Gemini. */
export function scheduleRestructure(memberId: string) {
  after(async () => {
    await restructureMember(memberId);
  });
}

export async function loadProfile(memberId: string) {
  const db = supabaseAdmin();
  const [{ data: rows }, { data: member }] = await Promise.all([
    db.from("member_profile_answers").select("question_key, answer_text, updated_at").eq("member_id", memberId),
    db
      .from("family_members")
      .select("name, interests, skills, activities_with_elder, conversation_topics, constraints, profile_summary, profile_updated_at")
      .eq("id", memberId)
      .single(),
  ]);
  if (!member) return null;
  return {
    name: member.name,
    answers: Object.fromEntries((rows ?? []).map((r) => [r.question_key, r.answer_text])),
    tags: {
      interests: member.interests ?? [],
      skills: member.skills ?? [],
      activities_with_elder: member.activities_with_elder ?? [],
      conversation_topics: member.conversation_topics ?? [],
    },
    constraints: (member.constraints ?? null) as Constraints | null,
    summary: member.profile_summary as string | null,
    updated_at: member.profile_updated_at as string | null,
  };
}

export { clean as cleanTags };
