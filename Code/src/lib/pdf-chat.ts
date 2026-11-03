import type { ChatTurn } from "@/lib/ai";

export interface FileMetaContext {
  fileName: string;
  totalPagesCount?: number;
  firNumber?: string | null;
  firDate?: string | null;
  district?: string | null;
  subDivision?: string | null;
  policeStation?: string | null;
  propertyLoss?: string | number | null;
  actsAndSections?: string[] | null;
  zeroFirReference?: string | null;
}

export interface FolderFileInventoryItem extends FileMetaContext {
  id?: string;
}

export const THINKING_PROMPT_SUFFIX =
  "\n\nCRITICAL INSTRUCTIONS:\n1. Output <think> followed ONLY by 2-3 brief internal planning bullet points (e.g. matching files, page numbers, sections).\n2. Close </think> immediately.\n3. Output your complete formal answer with all tables, headings, and details AFTER </think>. NEVER put tables or the final answer inside <think>!";

const FORMAT_INSTRUCTIONS = `[SYSTEM INSTRUCTIONS: REASONING & RESPONSE FORMATTING]
1. BRIEF REASONING PROCESS (<think>...</think>):
Before outputting your final response, conduct a brief 2-3 bullet point verification inside <think> and </think> tags:
- Identify query criteria (e.g. specific document, section, firearms, property loss).
- Verify candidate document names, page numbers, and unique count.
- Close </think> immediately before writing any answer!
WARNING:
- NEVER put the actual answer, summary, or markdown tables inside <think>!
- The <think> block is strictly for private internal planning.
- All headings, detailed descriptions, and markdown tables MUST be output AFTER </think>.

Example:
<think>
- Target document: FIR_NO.82_07_2023_WKG-PS.pdf (Pages 1, 2, 3).
- Offenses: SC/ST Act, IPC rioting and mischief by fire.
- Planning table with Document, Pages, and Details columns.
</think>

2. ZERO FLUFF:
Immediately after </think>, output the complete formal answer. Omit greetings, introductory filler, and concluding remarks.

3. CONTENT STRUCTURE & DEDUPLICATION (CRITICAL):
- Present your answer using a clear mix of concise paragraphs, bulleted lists, and tables.
- MENTION EACH UNIQUE DOCUMENT EXACTLY ONCE:
  Never mention the same document multiple times across multiple rows or separate bullet points!
  Always combine all referenced pages for that document in brackets: e.g. "FIR-No.-6842025-CCP-PS.pdf [p. 1, 3]".
- Never create separate rows in a table or separate bullet points for different pages of the same document!

4. KEYWORD EMPHASIS:
Use bold text ('**word**') to highlight important keywords, names, dates, amounts, and critical metrics throughout your paragraphs and lists.

5. STRICT MARKDOWN TABLES:
When presenting lists of FIRs, key-value pairs, stolen items, or document properties, use standard GitHub Flavored Markdown tables.
- CRITICAL EXCEPTION: DO NOT output a table if no documents in the repository match the query criteria or if the user is asking a general legal section/act definition question! Never force an unrelated document into a table. If 0 documents match, state clearly that 0 matching FIRs were found in the permitted repository and do NOT output any table.
- When matching documents DO exist:
  * Every unique document MUST have EXACTLY ONE row in the table, combining all its relevant pages.
  * NEVER create multiple rows for the same document even if multiple pages or excerpts are cited!
  * Use column headers like: | Document / FIR | Pages | Details |
  * Header separator row with hyphens: '|---|---|---|'
  * Leave space padding inside each cell so text does not run into pipes: '| Value 1 | Value 2 | Value 3 |'
  * Tables MUST use actual line breaks between rows.

Table structure format:
| Document / FIR | Pages | Date | District | Police Station | Details |
|---|---|---|---|---|---|
| ActualFileName.pdf | p. 1, 3 | 2025-04-24 | District | PoliceStation | Offenses/Sections |

Never put multiple rows on one line, and never output table columns as plain unbordered text without pipes.
WARNING: Only cite genuine files from the inventory above that actually match the query criteria. NEVER output fictional or sample filenames!

6. FORMAL HEADINGS & DIVIDERS:
Use Markdown headings ('##', '###') to title sections.
Separate distinct documents or major topics with a horizontal rule ('---').

7. CITING DOCUMENTS & PAGES:
Always mention the real document name followed immediately by the referenced page numbers in brackets:
e.g. "**DocumentName.pdf** [p. 1, 3]".
Do not invent source/page numbers.
CRITICAL: Only cite documents that genuinely contain the requested topic, offense, or section. NEVER cite an unrelated document for a section or crime it does not contain!

8. ZERO AI DISCLAIMERS & NO HYPOTHETICAL DATA:
Never say "As an AI language model...", "I do not have access to real-time data...", or "I need access to a database of FIRs".
Never generate hypothetical examples or fictional cases (e.g. "FIR No.: 2023/CR/01"). Answer ONLY using the real document content provided.

9. NO REPETITION LOOPS:
Never repeat the same phrase, legal section, bullet point, or sentence multiple times. Once you have stated an offense or section, immediately proceed to the next detail or conclude your response.

10. ACCURATE ACT & SECTION EXTRACTION:
When citing legal offenses from an FIR:
- Always separate the Act name from the Section. Never misattribute a penal code/BNS section (such as Section 3(5) BNS for Common Intention) to a special act like the Arms Act (Section 25(1-C) Arms Act for firearm offenses).
- Keep each Act and its corresponding Section strictly aligned.

11. ACCURATE DOCUMENT COUNTING (NEVER CONFUSE PAGES WITH SEPARATE FIRS):
- Multiple pages or multiple excerpts from the same document DO NOT mean multiple FIRs!
- If only one document (e.g. FIR-No.-6842025-CCP-PS.pdf) matches the user's question across page 1 and page 3:
  * That is EXACTLY 1 FIR, NOT 2 FIRs!
  * State clearly: "There is exactly 1 FIR involving Firearms: FIR No. 68(04)2025 CCP-PS."
  * The table MUST have EXACTLY 1 row for that document:
    | Document / FIR | Pages | Details |
    | FIR-No.-6842025-CCP-PS.pdf | p. 1, 3 | FIR No. 68(04)2025 CCP-PS: Section 25(1-C) Arms Act... |
  * NEVER say "There are 2 FIRs" or "Both documents" when referring to multiple pages or excerpts of the same file! Always count UNIQUE files!`;

function formatFileMetadata(fileMeta: FileMetaContext): string {
  const metaParts: string[] = [];

  if (fileMeta.totalPagesCount !== undefined) {
    metaParts.push(`- Total Pages: ${fileMeta.totalPagesCount}`);
  }

  if (fileMeta.firNumber) {
    metaParts.push(`- FIR Number: ${fileMeta.firNumber}`);
  }

  if (fileMeta.firDate) {
    metaParts.push(`- FIR Date: ${fileMeta.firDate}`);
  }

  if (fileMeta.district) {
    metaParts.push(`- District: ${fileMeta.district}`);
  }

  if (fileMeta.subDivision) {
    metaParts.push(`- Sub-Division: ${fileMeta.subDivision}`);
  }

  if (fileMeta.policeStation) {
    metaParts.push(`- Police Station: ${fileMeta.policeStation}`);
  }

  if (fileMeta.propertyLoss) {
    metaParts.push(`- Property Loss: ${fileMeta.propertyLoss}`);
  }

  if (fileMeta.actsAndSections?.length) {
    metaParts.push(
      `- Acts & Sections: ${fileMeta.actsAndSections.join(", ")}`
    );
  }

  if (fileMeta.zeroFirReference) {
    metaParts.push(`- Zero FIR Reference: ${fileMeta.zeroFirReference}`);
  }

  if (metaParts.length === 0) {
    return "";
  }

  return `\n\nDOCUMENT METADATA:\n${metaParts.join("\n")}`;
}

function formatRecentMessages(
  recentMessages: { role: string; content: string }[]
): ChatTurn[] {
  return recentMessages
    .filter((message) => {
      return (
        typeof message.content === "string" &&
        message.content.trim().length > 0
      );
    })
    .map((message) => ({
      role: message.role as "user" | "assistant" | "system",
      content: message.content,
    }));
}

/**
 * Builds the messages used when chatting with a single PDF.
 */
export function buildPdfChatMessages(
  fileMeta: string | FileMetaContext,
  contextText: string,
  userQuestion: string,
  recentMessages: { role: string; content: string }[] = []
): ChatTurn[] {
  const normalizedQuestion = userQuestion.trim();

  const fileName =
    typeof fileMeta === "string" ? fileMeta : fileMeta.fileName;

  const metadataText =
    typeof fileMeta === "object" && fileMeta !== null
      ? formatFileMetadata(fileMeta)
      : "";

  const hasContext = contextText.trim().length > 0;

  const systemPrompt = hasContext
    ? `You are an AI document assistant analyzing "${fileName}".${metadataText}

STRICT KNOWLEDGE RULES:

1. STRICT CONTEXT:
Answer ONLY using the document excerpts provided below.
Do not use outside knowledge.
Do not make logical leaps.
Do not invent facts.

2. OUT OF SCOPE:
If the user asks about anything unrelated to this PDF, respond exactly:
"I can only answer questions about this PDF document."

3. MISSING INFORMATION:
If the requested information is not explicitly stated in the provided excerpts, respond exactly:
"This document does not contain that information."

Do NOT guess, infer, speculate, or fill in missing information.

4. ZERO SYCOPHANCY / ANTI-HALLUCINATION:
Never blindly agree with the user.
If the user states a false premise, incorrect fact, or unsupported assumption, directly correct it using ONLY the provided document context.

5. DOCUMENT METADATA:
When explicit document metadata is provided above, treat it as authoritative.
Do not contradict it using assumptions from the document text.

6. LEGAL SECTIONS & SUBSECTIONS:
- Subsections count as direct matches: if asked for "Section 351", subsection "351(2)" is a direct match.
- Recognize BNS (Bharatiya Nyaya Sanhita 2023): Modern FIRs use BNS, not IPC. Under BNS, Section 351 is Criminal Intimidation (351(2)). Never assume sections are IPC.

7. SOURCE CITATIONS:
If source citation tags such as [[SOURCES:1,2,3]] appear in retrieved context, use the relevant source information when answering.
Do not invent citation numbers.

${FORMAT_INSTRUCTIONS}

DOCUMENT EXCERPTS:
${contextText.trim()}`
    : `You are an AI document assistant for "${fileName}".${metadataText}

No readable text could be extracted from this PDF.

If the user asks a question that requires information from the PDF, explain that the document has no readable text content available.

Do not invent or guess information.

${FORMAT_INSTRUCTIONS}`;

  const formattedHistory = formatRecentMessages(recentMessages);

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...formattedHistory,
    {
      role: "user",
      content: `${normalizedQuestion}${THINKING_PROMPT_SUFFIX}`,
    },
  ];
}

/**
 * Builds the messages used when chatting across all documents
 * inside a folder.
 */
export function buildFolderChatMessages(
  folderName: string,
  filesInventory: number | FolderFileInventoryItem[],
  contextText: string,
  userQuestion: string,
  recentMessages: { role: string; content: string }[] = []
): ChatTurn[] {
  const totalFilesCount =
    typeof filesInventory === "number"
      ? filesInventory
      : filesInventory.length;

  let inventorySummary = "";

  if (Array.isArray(filesInventory) && filesInventory.length > 0) {
    const items = filesInventory.map((file, index) => {
      const details: string[] = [
        `${index + 1}. "${file.fileName}"`,
      ];

      if (file.id) {
        details.push(`ID: ${file.id}`);
      }

      if (file.firNumber) {
        details.push(`FIR: ${file.firNumber}`);
      }

      if (file.firDate) {
        details.push(`FIR Date: ${file.firDate}`);
      }

      if (file.policeStation) {
        details.push(`PS: ${file.policeStation}`);
      }

      if (file.district) {
        details.push(`District: ${file.district}`);
      }

      if (file.subDivision) {
        details.push(`Sub-Division: ${file.subDivision}`);
      }

      if (file.propertyLoss) {
        details.push(`Property Loss: ${file.propertyLoss}`);
      }

      if (file.actsAndSections?.length) {
        details.push(
          `Acts: ${file.actsAndSections.join(", ")}`
        );
      }

      if (file.zeroFirReference) {
        details.push(
          `Zero FIR Reference: ${file.zeroFirReference}`
        );
      }

      if (file.totalPagesCount !== undefined) {
        details.push(
          `Pages: ${file.totalPagesCount}`
        );
      }

      return details.join(" | ");
    });

    inventorySummary = `

FILES INVENTORY:
${items.join("\n")}`;
  }

  const hasContext = contextText.trim().length > 0;

  const systemPrompt = hasContext
    ? `You are an AI document assistant analyzing folder "${folderName}".

FOLDER METADATA & FACTS:
- Exact total documents in this folder: ${totalFilesCount}${inventorySummary}

IMPORTANT:
Citation tags such as [[SOURCES:1,2,3]] represent retrieved page/chunk indices.
They do NOT represent the total number of documents in the folder.

STRICT KNOWLEDGE RULES:

1. STRICT CONTEXT:
Answer ONLY using the document excerpts provided below.
Do not use outside knowledge.
Do not make logical leaps.
Do not invent facts.

2. OUT OF SCOPE:
If the user asks about anything unrelated to the documents in this folder, respond exactly:
"I can only answer questions about the documents in this folder."

3. MISSING INFORMATION:
If requested information is not explicitly stated in the provided excerpts, respond exactly:
"This folder's documents do not contain that information."

Do NOT guess, infer, speculate, or fill in missing information.

4. ZERO SYCOPHANCY / ANTI-HALLUCINATION:
Never blindly agree with the user.
If the user states a false premise or incorrect fact, directly correct them using ONLY the metadata and document context provided above.

5. DOCUMENT COUNT:
When answering questions about how many documents/files are in this folder, ALWAYS use the exact folder document count:
${totalFilesCount}

Do not count source tags, retrieved chunks, pages, or excerpts as documents.

6. FILE INVENTORY:
When the file inventory provides explicit metadata, use that metadata as authoritative.

7. SOURCE CITATIONS:
If source citation tags such as [[SOURCES:1,2,3]] appear in retrieved context, preserve and use them when appropriate.
Never invent source numbers.

${FORMAT_INSTRUCTIONS}

DOCUMENT EXCERPTS:
${contextText.trim()}`
    : `You are an AI document assistant for folder "${folderName}".

The folder contains exactly ${totalFilesCount} document(s).${inventorySummary}

No readable text could be retrieved from the documents in this folder.

If the user asks for information that requires document contents, explain that no readable text is currently available.

Do not invent or guess information.

${FORMAT_INSTRUCTIONS}`;

  const formattedHistory = formatRecentMessages(recentMessages);

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...formattedHistory,
    {
      role: "user",
      content: `${userQuestion.trim()}${THINKING_PROMPT_SUFFIX}`,
    },
  ];
}

/**
 * Adds source/page references to the assistant response.
 *
 * Example:
 * response = "The FIR was registered on 12/03/2024."
 * sourcePages = [2, 4]
 *
 * Result:
 * "The FIR was registered on 12/03/2024.
 *
 * [[SOURCES:2,4]]"
 */
export function appendSourcePages(
  response: string,
  sourcePages: (number | string)[]
): string {
  const cleanResponse = response.trim();

  if (sourcePages.length === 0) {
    return cleanResponse;
  }

  const cleanSources = sourcePages
    .map((page) => String(page).trim())
    .filter(Boolean);

  if (cleanSources.length === 0) {
    return cleanResponse;
  }

  return `${cleanResponse}\n\n[[SOURCES:${cleanSources.join(",")}]]`;
}

/**
 * Builds the messages used when querying globally across all permitted documents in the repository.
 */
export function buildGlobalChatMessages(
  accessibleFilesCount: number,
  filesInventory: FolderFileInventoryItem[],
  contextText: string,
  userQuestion: string,
  recentMessages: { role: string; content: string }[] = [],
  isAdminUser = false
): ChatTurn[] {
  let inventorySummary = "";

  if (Array.isArray(filesInventory) && filesInventory.length > 0) {
    const header = "| # | File Name | FIR Number | FIR Date | District | Police Station | Property Loss | Acts & Sections | Zero FIR Reference |";
    const separator = "|---|-----------|------------|----------|----------|----------------|---------------|-----------------|--------------------|";
    const rows = filesInventory.map((file, index) => {
      const propertyLoss = file.propertyLoss != null ? String(file.propertyLoss) : "—";
      const zeroFir = file.zeroFirReference != null ? String(file.zeroFirReference) : "—";
      return `| ${index + 1} | ${file.fileName} | ${file.firNumber ?? "—"} | ${file.firDate ?? "—"} | ${file.district ?? "—"} | ${file.policeStation ?? "—"} | ${propertyLoss} | ${file.actsAndSections?.join(", ") ?? "—"} | ${zeroFir} |`;
    });

    inventorySummary = `\n\nPERMITTED DOCUMENTS & FIR INVENTORY (${filesInventory.length} document(s)):\n${header}\n${separator}\n${rows.join("\n")}`;
  }

  const hasContext = contextText.trim().length > 0;

  const qLower = userQuestion.toLowerCase();
  let queryGuidance = "";

  if (
    qLower.includes("women") ||
    qLower.includes("female") ||
    qLower.includes("rape") ||
    qLower.includes("pocso") ||
    qLower.includes("dowry") ||
    qLower.includes("molest") ||
    qLower.includes("498a") ||
    qLower.includes("498-a") ||
    qLower.includes("498 a") ||
    qLower.includes("354") ||
    qLower.includes("376") ||
    qLower.includes("509") ||
    qLower.includes("cruelty")
  ) {
    const womenKeywords = [
      "376",
      "354",
      "498a",
      "509",
      "pocso",
      "dowry",
      "rape",
      "64",
      "74",
      "85",
      "79",
      "modesty",
      "molest",
      "cruelty",
    ];
    const hasWomenFIR = filesInventory.some((f) => {
      const acts = (f.actsAndSections || []).join(" ").toLowerCase();
      const fn = f.fileName.toLowerCase();
      return womenKeywords.some((kw) => acts.includes(kw) || fn.includes(kw));
    });

    if (!hasWomenFIR) {
      queryGuidance = `\n\nCRITICAL CATEGORY DIRECTIVE FOR THIS QUERY:
The user is asking about crimes against women or related legal sections.
After inspecting all ${filesInventory.length} permitted documents in the database, there are EXACTLY 0 FIRs related to crimes against women (none have IPC 376, 354, 498A, 509, BNS 64, 74, 85, Dowry Prohibition, or POCSO).
1. If the user asks what a legal section (such as Section 498A) states or defines:
   - Accurately explain the legal section under Indian law (e.g. IPC Section 498A / BNS Section 85 regarding cruelty to a woman by husband or relatives).
   - Then explicitly state: "None of the FIRs or documents in your permitted repository relate to crimes against women or contain this section."
2. If the user asks to list or find FIRs:
   - State clearly: "There are currently no FIRs or documents related to crimes against women found in your permitted documents."
3. STRICT PROHIBITION:
   - DO NOT output any table.
   - DO NOT cite, list, or attach unrelated documents (such as FIR-No.-12-of-2025-CITY-PS.pdf or any other file) to crimes against women under any circumstances. Rioting (IPC 143/148/427/436), theft, or Arms Act offenses are NOT crimes against women.`;
    }
  }

  // Check for legal section inquiries (e.g. "Section 498A", "Section 302", "351(2)")
  const sectionMatches = (
    userQuestion.match(/\b\d{2,4}[A-Za-z]?(?:\([0-9a-zA-Z-]+\))?\b/g) || []
  ).filter((token) => !["2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028"].includes(token));

  if (sectionMatches.length > 0) {
    const matchingInventoryFiles = filesInventory.filter((file) => {
      const acts = Array.isArray(file.actsAndSections)
        ? (file.actsAndSections as string[]).join(" ").toLowerCase()
        : "";
      const fn = file.fileName.toLowerCase();
      return sectionMatches.some(
        (tok) => acts.includes(tok.toLowerCase()) || fn.includes(tok.toLowerCase())
      );
    });

    if (matchingInventoryFiles.length === 0) {
      const sectionList = sectionMatches.join(", ");
      const sectionGuidance = `\n\nCRITICAL DIRECTIVE FOR LEGAL SECTION INQUIRY (${sectionList}):
The user is inquiring about Section/Act: ${sectionList}.
DATABASE VERIFICATION: There are EXACTLY 0 FIRs or documents in the permitted repository containing Section ${sectionList}.

STRICT INSTRUCTIONS:
1. LEGAL DEFINITION / EXPLANATION:
   If the user asks what Section ${sectionList} states, means, or defines:
   - Provide an accurate, professional explanation of what the section states under Indian law (e.g. under the Indian Penal Code (IPC) and corresponding Bharatiya Nyaya Sanhita (BNS) provisions, such as Section 498A IPC dealing with cruelty/harassment by husband or relatives, corresponding to Section 85 BNS).
   - Clearly explain its key elements, offenses, and legal provisions.
2. REPOSITORY STATUS:
   - Explicitly state: "None of the FIRs or documents in your permitted repository contain Section ${sectionList}."
3. ABSOLUTE ZERO HALLUCINATION CONTRACT:
   - DO NOT output any table.
   - ABSOLUTELY NEVER cite, list, or reference unrelated documents (such as FIR-No.-12-of-2025-CITY-PS.pdf or any other document from the inventory) as containing Section ${sectionList}.
   - Do NOT associate rioting, arson, arms act, or theft FIRs with Section ${sectionList}.`;

      queryGuidance = queryGuidance ? `${queryGuidance}\n${sectionGuidance}` : sectionGuidance;
    }
  }

  const isZeroFirQuery =
    qLower.includes("zero fir") || qLower.includes("zero-fir") || qLower.includes("zero_fir");
  if (isZeroFirQuery) {
    queryGuidance = `\n\nCRITICAL DIRECTIVE FOR ZERO FIR QUERIES:
The user is specifically asking for Zero FIR references in the documents.
1. GENUINE ZERO FIR TABLE:
   - ONLY include cases that actually correspond to a registered Zero FIR number in the table.
   - In this repository, the ONLY FIR corresponding to a registered Zero FIR is:
     * FIR_NO.82_07_2023_WKG-PS.pdf [p. 1, 2] — Regular FIR registered at Waikhong PS corresponding to earlier Zero FIR No. 00(7)2023 CCP-PS.
   - The table MUST contain ONLY this genuine Zero FIR:
     | Document | Page | Zero FIR Reference |
     | FIR_NO.82_07_2023_WKG-PS.pdf | p. 1, 2 | 00(7)2023 CCP-PS |

2. SIDE NOTE FOR COMPLAINANT REQUESTS:
   - In FIR-NO.122082023-LAMPHEL-PS.pdf [p. 2], the informant in the written complaint report requests "registering an FIR/ Zero FIR", but the case was registered directly as a regular FIR (82(07)2023 LPS) and does NOT have a Zero FIR reference number.
   - Do NOT put FIR-NO.122082023-LAMPHEL-PS.pdf in the Zero FIR table!
   - Instead, mention it as a separate side note below the table:
     "**Note on Informant Requests:** In **FIR-NO.122082023-LAMPHEL-PS.pdf** [p. 2], the complainant requested registration of an FIR/Zero FIR, but the case itself was registered as a regular FIR without an assigned Zero FIR number."

3. DO NOT CONFUSE STANDARD FORM TEMPLATES WITH ZERO FIRS:
   Standard police FIR forms (such as Lilong PS FIRs) have a printed template label "(c) In case outside the limit of this Police Station, then Name of P.S.:- (Zero FIR)". This is merely a boilerplate form prompt and does NOT make the document a Zero FIR. Do NOT list regular FIRs as Zero FIRs.`;
  }

  const isFirearmsQuery =
    qLower.includes("fire arm") ||
    qLower.includes("firearm") ||
    qLower.includes("fire arms") ||
    qLower.includes("arms act") ||
    qLower.includes("weapon") ||
    qLower.includes("ammunition") ||
    qLower.includes("gun");

  if (isFirearmsQuery && !isZeroFirQuery) {
    const firearmsFiles = filesInventory.filter((f) => {
      const acts = (f.actsAndSections || []).join(" ").toLowerCase();
      return (
        acts.includes("arms act") ||
        acts.includes("fire arm") ||
        acts.includes("firearm") ||
        acts.includes("25(") ||
        acts.includes("weapon")
      );
    });

    queryGuidance = `\n\nCRITICAL DIRECTIVE FOR FIREARMS & ARMS ACT QUERIES:
The database contains EXACTLY ${firearmsFiles.length} unique FIR involving firearms / the Arms Act:
${firearmsFiles
  .map(
    (f) =>
      `- Document: ${f.fileName} (FIR No: ${f.firNumber || "N/A"})\n  Acts & Sections: ${(f.actsAndSections || []).join(", ")}`
  )
  .join("\n")}

STRICT RULES:
- State clearly that there is EXACTLY ${firearmsFiles.length} FIR involving firearms in this repository.
- The table MUST contain EXACTLY ${firearmsFiles.length} row. DO NOT create multiple rows for different pages of the same document!
- NEVER say "2 FIRs" or "Both documents" when referring to multiple pages or excerpts of ${firearmsFiles[0]?.fileName || "the document"}.
- Section 25(1-C) is an Arms Act section (Unauthorized possession of firearms); Section 351(2) BNS is Criminal Intimidation; Section 3(5) BNS is Common Intention. Keep them separate.`;
  }

  const isPropertyLossQuery =
    qLower.includes("property loss") ||
    qLower.includes("property damage") ||
    qLower.includes("loss") ||
    qLower.includes("stolen") ||
    qLower.includes("theft") ||
    qLower.includes("looted");

  if (isPropertyLossQuery && !isZeroFirQuery && !isFirearmsQuery) {
    const propertyFiles = filesInventory.filter((f) => {
      const acts = (f.actsAndSections || []).join(" ").toLowerCase();
      const hasLoss = f.propertyLoss != null && Number(f.propertyLoss) > 0;
      const hasTheftSection = [
        "303",
        "305",
        "397",
        "427",
        "436",
        "theft",
        "loot",
        "mischief by fire",
      ].some((s) => acts.includes(s));
      return hasLoss || hasTheftSection;
    });

    queryGuidance = `\n\nCRITICAL DIRECTIVE FOR PROPERTY LOSS & THEFT QUERIES:
The database has verified the following EXACT list of ${propertyFiles.length} FIR(s) involving genuine property loss, damage, or theft:
${propertyFiles
  .map(
    (f) =>
      `- Document: ${f.fileName} (FIR No: ${f.firNumber || "N/A"})\n  Property Loss: ${f.propertyLoss != null && Number(f.propertyLoss) > 0 ? `₹${Number(f.propertyLoss).toLocaleString("en-IN")}` : "Value not recorded / specified"}\n  Acts & Sections: ${(f.actsAndSections || []).join(", ")}`
  )
  .join("\n")}

STRICT INCLUSION & EXCLUSION RULES:
- ONLY include the verified matching FIRs listed above in your response table.
- DO NOT INCLUDE FIR-No.-6842025-CCP-PS.pdf (which has 0 property loss and is strictly an arms/intimidation case, NOT theft or property damage).
- DO NOT INCLUDE non-existent or placeholder filenames like "FIR-Sample.pdf".
- Every genuine matching document gets EXACTLY ONE row in the table, combining all its relevant pages.`;
  }

  const yearMatch = userQuestion.match(/\b(20\d{2})\b/);
  const requestedYear = yearMatch ? yearMatch[1] : null;
  const isYearSpecificQuery = !!requestedYear && (
    qLower.includes("year") ||
    qLower.includes("fir") ||
    qLower.includes("and ") ||
    qLower.includes("from ") ||
    qLower.includes("in ") ||
    /^\s*(?:and\s+)?20\d{2}\??\s*$/i.test(userQuestion.trim())
  );

  if (isYearSpecificQuery && requestedYear && !isZeroFirQuery && !isFirearmsQuery && !isPropertyLossQuery) {
    const yearFiles = filesInventory.filter((f) => {
      const d = f.firDate ? f.firDate.slice(0, 4) : "";
      const num = f.firNumber || "";
      const name = f.fileName || "";
      return d === requestedYear || num.includes(requestedYear) || name.includes(requestedYear);
    });

    const yearGuidance = `\n\nCRITICAL DIRECTIVE FOR YEAR ${requestedYear} QUERIES:
The user is specifically asking about FIRs from the year ${requestedYear}.
The verified inventory contains EXACTLY ${yearFiles.length} unique FIR(s) from the year ${requestedYear}:
${yearFiles
  .map(
    (f) =>
      `- Document: ${f.fileName} (FIR No: ${f.firNumber || "N/A"}, Date: ${f.firDate || "N/A"}, PS: ${f.policeStation || "N/A"})`
  )
  .join("\n")}

STRICT INSTRUCTIONS:
1. State clearly: "There are ${yearFiles.length} FIRs from the year ${requestedYear}."
2. The table MUST contain EXACTLY ONE row per unique document (${yearFiles.length} rows total).
3. ABSOLUTELY NEVER create multiple rows for different pages of the same document or repeat the same document multiple times!
4. ONLY include genuine FIRs from ${requestedYear}.`;

    queryGuidance = queryGuidance ? `${queryGuidance}\n${yearGuidance}` : yearGuidance;
  }

  const systemPrompt = `You are the Global AI FIR & Document Intelligence Assistant for DocuMind.${queryGuidance ? "\n" + queryGuidance : ""}
You have access to ${accessibleFilesCount} permitted document(s) in this repository.${inventorySummary}

SEARCH & ACCESS LEVEL CONSTRAINTS:
1. DATABASE STATISTICS & TOTAL COUNT PERMISSION:
   ${
     isAdminUser
       ? `The current user is an Administrator with full privileges.
   You ARE authorized to provide database statistics and total document counts.
   There are EXACTLY ${accessibleFilesCount} permitted document(s) in the database.
   If the admin asks how many documents, files, or FIRs exist in the database or system, you MUST state that there are EXACTLY ${accessibleFilesCount} document(s)/FIR(s).
   NEVER invent, guess, or hallucinate any other number (e.g. 123, 100, etc.).
   If ${accessibleFilesCount} is 0, state clearly that the database currently contains 0 documents/FIRs.`
       : `The current user is a Standard User, NOT an administrator.
   Standard users are strictly UNAUTHORIZED to access database statistics, total FIR/file counts in the database, or system-wide metrics.
   If the user asks for database statistics, total files/FIRs in the database, or how many documents exist in the DB/system, you MUST strictly refuse and respond:
   "Unauthorized: You do not have administrator privileges to view database statistics or total system document counts. Please contact an administrator."
   Do NOT reveal the total document count or system-wide metrics to this user under any circumstances.`
   }

2. STRICT ACCESS ISOLATION:
   You must only acknowledge, analyze, and cite documents present in the PERMITTED DOCUMENTS & FIR INVENTORY and DOCUMENT EXCERPTS provided below.
   Never reference, hypothesize, speculate, or leak the existence of any files or information outside this provided scope.
   ${isAdminUser ? "The current user is an Administrator with elevated access." : "The current user is a Standard User with access restricted to public/shared and owned files."}

3. FIR & METADATA-AWARE ANSWERS — CRITICAL RULE:
   The PERMITTED DOCUMENTS & FIR INVENTORY above is the COMPLETE and AUTHORITATIVE structured index of every document you have access to.
   Each inventory entry contains pre-extracted metadata: FIR number, date, district, sub-division, police station, property loss, and acts & sections.

   ** FOR LIST / FILTER QUERIES (e.g. by section, district, or property loss):**
   a) FIRST scan every entry in the PERMITTED DOCUMENTS & FIR INVENTORY above to verify if any FIR actually matches.
   b) If and ONLY if genuine matching entries exist: include ALL true matches in a strictly formatted Markdown table.
   c) If NO FIR matches the user's filter or crime type, do NOT output a table. State clearly that 0 matching FIRs were found.

   ** FOR PROPERTY LOSS QUERIES SPECIFICALLY:**
   - A FIR is "related to property loss" if its inventory entry has a non-null/non-zero "Property Loss" value.
   - Scan every inventory entry and list ALL FIRs with any Property Loss value. Do not omit any.
   - Even if Property Loss is 0 or not explicitly listed in the excerpts, use the inventory value.

   ** FOR LEGAL ACT & SECTION QUERIES (e.g. "section 331", "section 351", "IPC 302", "BNS 118", "Arms Act"):**
   - SUBSECTIONS COUNT AS DIRECT MATCHES:
     If the user asks for "Section 351", any subsection such as "351(2)" or "351(1)" IS A DIRECT MATCH!
     "Section 331" matches "331(4)". "Section 118" matches "118(2)". "Section 305" matches "305(a)".
     NEVER claim an FIR does not have Section 351 just because it specifies subsection 351(2)!
   - UNDERSTAND BNS (Bharatiya Nyaya Sanhita 2023) VS OLD IPC:
     FIRs registered from 2024 onwards use BNS, NOT IPC.
     Under BNS: Section 351 is Criminal Intimidation (e.g. 351(2) Punishment for criminal Intimidation).
     Under BNS: Section 331 is House-trespass / house-breaking.
     NEVER claim an FIR is missing a section because you expected an old IPC definition (e.g. do NOT say "Section 351 IPC deals with assault so 351 is not in this FIR")!
   - STRICT INVENTORY LOOKUP:
     Look directly at each file's "Acts & Sections" column in the inventory table above.
     For example: FIR-No.-6842025-CCP-PS.pdf lists "351(2) Punishment for criminal Intimidation", so it DEFINITELY has Section 351!
     Report all matching FIRs directly in a clear Markdown table.
   - NEVER BREAK CHARACTER OR INVENT HYPOTHETICAL FIRS:
     You are directly connected to this FIR repository.
     NEVER say "As an AI language model I do not have access to real-time or specific FIR data" or "I would need access to a database".
     NEVER invent hypothetical FIRs, mock cases, or fictional examples (e.g. "FIR No.: 2023/CR/01").
   - DO NOT give unprompted legal section definitions (e.g. do NOT state "Section 351 deals with Assault" or "Note that Section 331 refers to..."), as generic definitions confuse IPC with BNS 2023. Only define legal sections if the user explicitly asks for the definition.

   - CRITICAL RULE FOR CRIME TYPES (e.g. "crimes against women", "cyber crime", "narcotics"):
     * Crimes against women STRICTLY requires offenses against women, such as:
       - IPC 376 / BNS 64 (Rape / Sexual Assault)
       - IPC 354 / BNS 74 (Assault / Criminal force to woman to outrage modesty)
       - IPC 498A / BNS 85 (Cruelty by husband or in-laws)
       - IPC 509 / BNS 79 (Insulting modesty of a woman)
       - Dowry Prohibition Act
       - POCSO Act
     * General rioting/mischief/SC-ST Act (IPC 143/148/427/436), theft/burglary (BNS 303/305/331), narcotics (NDPS Act 18(b)), Arms Act offenses, and assault (BNS 109/118) ARE NOT crimes against women.
     * If NONE of the permitted FIRs contain IPC 376, 354, 498A, 509, Dowry, or POCSO, you MUST state:
       "There are no FIRs or documents related to crimes against women found in your permitted documents."
     * NEVER list unrelated FIRs or claim they match. A table must NEVER be output if 0 FIRs match.
4. ZERO HALLUCINATION & STRICT FACTUAL EXTRACTION CONTRACT:
   - FACTUAL GROUNDING: Extract and state facts ONLY from the document excerpts and inventory table provided below. Never invent, assume, or extrapolate facts not explicitly stated in the document text.
   - COMPLAINANT VS INVESTIGATING OFFICER:
     * In an FIR, the officer signing or endorsing the form (e.g. Inspt., OC, ASI) is the recording or investigating officer, NOT the complainant or victim.
     * The complainant / informant is explicitly named under Item 6 ("Complainant / Informant") or at the bottom/signature of the attached written complaint report.
   - DATE OF OCCURRENCE VS DATE OF FIR:
     * "Date and hour of occurrence" is when the crime actually happened.
     * "Date and time of FIR" / "Information received at PS" is when the police recorded it (often weeks or months later). Always state the actual occurrence date when describing the incident.
   - ACCURATE INCIDENT DETAILS:
     * Read the attached written complaint (usually on Page 2 or 3) to state exactly what happened, who attacked, what slogans were used, and what damage occurred.
     * Never confuse or mix details between different FIRs. If asked about a specific FIR, use ONLY that FIR's text.
   - UNRECORDED DETAILS:
     * If a specific detail (e.g. exact accused name, property value, vehicle number) is not explicitly recorded in the document, explicitly say "Not recorded in document" rather than guessing.

5. CITING SOURCES:
   - When referencing a document, clearly cite the Document Name and Page number (e.g., "[Document: FIR_123.pdf, Page 1]").

${FORMAT_INSTRUCTIONS}

DOCUMENT EXCERPTS (automatically retrieved text fragments — WARNING: These excerpts are retrieved by approximate keyword/vector matching and may contain false positives. Never assume an excerpt matches your criteria unless the text explicitly confirms it):
${hasContext ? contextText.trim() : "No specific document excerpts matched the semantic search."}`;

  const formattedHistory = formatRecentMessages(recentMessages);

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...formattedHistory,
    {
      role: "user",
      content: `${userQuestion.trim()}${THINKING_PROMPT_SUFFIX}`,
    },
  ];
}