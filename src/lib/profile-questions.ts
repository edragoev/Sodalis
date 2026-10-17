export const QUESTIONS = [
  { key: "with_elder", text: "What do you like to do with them when you visit?" },
  { key: "interests", text: "What are your hobbies and interests?" },
  { key: "skills", text: "What are you good at, or happy to help with (fixing things, driving, cooking, tech)?" },
  { key: "talk_about", text: "What do you two talk about or laugh about?" },
  { key: "wish", text: "Is there something you'd love to do with them but haven't yet?" },
  { key: "logistics", text: "How do you usually get to visit?" },
] as const;

export type QuestionKey = (typeof QUESTIONS)[number]["key"];
export const QUESTION_KEYS: string[] = QUESTIONS.map((q) => q.key);
