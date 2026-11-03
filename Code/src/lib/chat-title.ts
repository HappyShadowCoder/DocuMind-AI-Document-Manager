/**
 * src/lib/chat-title.ts
 *
 * Generates clean, intelligent titles for chat sessions based on user queries.
 */

export function generateChatTitle(query: string): string {
  const q = query.toLowerCase().trim();

  // 1. High-frequency document-analysis intents get polished concise titles
  if (/\b(about|overview|summary|summarize|what is this|tell me about|describe|brief|explain document)\b/i.test(q)) {
    return "Document Overview";
  }
  if (/\b(act|acts|section|sections|bns|ipc|law|penal|offence|offense|punishment)\b/i.test(q)) {
    return "Acts & Legal Sections";
  }
  if (/\b(fir number|fir no|fir details|case number|case no|registered|case)\b/i.test(q)) {
    return "FIR Details";
  }
  if (/\b(complainant|victim|who filed|reported by|informant)\b/i.test(q)) {
    return "Complainant Information";
  }
  if (/\b(accused|suspect|perpetrator|who did|suspects|culprit)\b/i.test(q)) {
    return "Accused & Suspects";
  }
  if (/\b(loss|damage|property|value|amount|rupee|inr|money|cost)\b/i.test(q)) {
    return "Property Loss & Damages";
  }
  if (/\b(station|police station|district|location|place|where|sub division|address)\b/i.test(q)) {
    return "Jurisdiction & Location";
  }
  if (/\b(date|time|when|hour|occurrence|timeline|happened)\b/i.test(q)) {
    return "Date & Occurrence";
  }
  if (/\b(evidence|weapon|firearm|bullet|rounds|seized|recovered)\b/i.test(q)) {
    return "Evidence & Weapons";
  }
  if (/\b(investigation|officer|io|action|steps|inquiry)\b/i.test(q)) {
    return "Investigation Status";
  }

  // 2. Fallback: Clean user query naturally without breaking grammar
  let clean = query
    .replace(/[#*`_]/g, "")
    .replace(/[?!.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip conversational polite prefixes like "can you please", "could you please"
  clean = clean.replace(/^(can you (please )?|could you (please )?|please |kindly )/i, "");
  if (!clean) return "New Conversation";

  // Capitalize first letter cleanly
  const capped = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (capped.length <= 42) return capped;

  const truncated = capped.slice(0, 42);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 24 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
