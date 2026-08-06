import type { ChatTurn } from "@/lib/ai";

export function buildPdfChatMessages(
  fileName: string,
  contextText: string,
  userQuestion: string,
  recentMessages: { role: string; content: string }[] = []
): ChatTurn[] {
  const systemPrompt = contextText.trim()
    ? `You are a PDF document assistant for "${fileName}".

STRICT RULES:
1. Answer ONLY using the document excerpts below. Do not use outside knowledge.
2. If the user asks about anything unrelated to this PDF, respond: "I can only answer questions about this PDF document."
3. If the requested information is not in the excerpts, respond: "This document does not contain that information."

DOCUMENT EXCERPTS:
${contextText}`
    : `You are a PDF document assistant for "${fileName}".
No text could be extracted from this PDF. Tell the user the document has no readable text content and you cannot answer questions about it.`;

  // Map history to standard ChatTurn structure
  const formattedHistory: ChatTurn[] = recentMessages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  }));

  // Strict output format suffix to eliminate inline dots and repeated summaries
  const enforcedUserPrompt = `${userQuestion}

[STRICT RESPONSE FORMAT REQUIREMENTS]
1. NO INTRO/OUTRO: Start immediately with the Markdown table character '|'. Do not write any opening sentence.
2. TABLE SYNTAX: Put every single row of the Markdown table on its own new line.
3. NO REPETITION: Do NOT write a paragraph or list below the table that repeats the table's contents.
4. LIST SYNTAX: If additional details are required beyond the table, start every single bullet point on a NEW LINE using a hyphen and a space (\`- \`). NEVER use inline dots (\`•\`) or write bullet points inside a single continuous paragraph.`;

  return [
    { role: "system", content: systemPrompt },
    ...formattedHistory,
    { role: "user", content: enforcedUserPrompt },
  ];
}

export function appendSourcePages(response: string, sourcePages: number[]): string {
  if (sourcePages.length === 0) return response;
  return `${response.trim()}\n\n[[SOURCES:${sourcePages.join(",")}]]`;
}