import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchKB } from "../../lib/kbSearch";
import { prefetchWeb } from "../../lib/webPrefetch";

export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ContentBlock = { type: string; [key: string]: unknown };
type SimpleMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export async function POST(req: NextRequest) {
  const { messages, fileId, fileIds, pdfFiles, thresholdPrompt, columnMapping, schoolContext, kbScope, userSchool }: {
    messages: SimpleMessage[];
    fileId?: string;
    // Multiple related-but-unmerged sheets (e.g. a roster plus a separate
    // behavior log) — used instead of fileId when a teacher picked more than
    // one sheet from a multi-tab upload without merging them first. Claude
    // cross-references these itself via code execution rather than us
    // pre-computing a join — see the "Reading multiple files" prompt section.
    fileIds?: { fileId: string; filename: string }[];
    pdfFiles?: { name: string; fileId: string }[];
    thresholdPrompt?: string;
    columnMapping?: Record<string, string>;
    schoolContext?: string;
    kbScope?: string;
    // The requesting teacher's own school (from their account) — scopes
    // "school"-tagged KB results to just their school, not every school's.
    userSchool?: string;
  } = await req.json();
  const hasDataFiles = !!fileId || !!fileIds?.length;

  // Parse source scope tokens — KB/web run whenever their chips are active.
  const scopeTokens = (kbScope ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const kbScopes = scopeTokens.filter(s => s === 'student_success' || s === 'school');
  const useWeb = scopeTokens.includes('web');

  // KB query: use the last plain-text user message (not tool_result blocks).
  // When a clarifying-question cycle is in progress, tool_result messages have
  // array content — we look past them to find the original substantive question.
  const lastUserMsg = [...messages]
    .reverse()
    .map(m => m.content)
    .find((c): c is string => typeof c === 'string' && c.trim().length > 0) ?? '';

  // Pure chat mode (no CSV, no uploaded PDFs) — KB search is handled on-demand
  // via the search_strategies tool so the model retrieves docs with a targeted
  // query AFTER gathering context. Upfront search still runs for PDF and CSV
  // modes where docs are attached before the first LLM call.
  const isChatMode = !hasDataFiles && !pdfFiles?.length;

  const [kbDocs, webResult] = isChatMode
    ? [[], { summary: '', sources: [] as { title: string; url: string }[] }]
    : await Promise.all([
        kbScopes.length ? searchKB(lastUserMsg, kbScopes, 4, userSchool) : Promise.resolve([]),
        useWeb ? prefetchWeb(lastUserMsg) : Promise.resolve({ summary: '', sources: [] as { title: string; url: string }[] }),
      ]);
  const webSources = webResult.sources;
  if (!isChatMode) {
    console.log('🔍 KB scopes:', kbScopes, 'Web enabled:', useWeb);
    console.log('📚 KB docs:', kbDocs.length, 'Web sources:', webSources.length);
    if (webResult.summary) console.log('🌐 Web summary preview:', webResult.summary.slice(0, 200));
  }

  // Drop empty plain-text assistant messages (empty strings left by interrupted streams).
  // Do NOT merge consecutive user messages anymore — tool_result blocks must stay
  // paired with their preceding tool_use block.
  const normalizedMessages: SimpleMessage[] = messages.filter(msg => {
    if (msg.role === 'assistant' && typeof msg.content === 'string' && !msg.content.trim()) return false;
    return true;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let apiMessages: Anthropic.MessageParam[] = normalizedMessages.map((m) => ({
    role: m.role,
    content: m.content as any,
  }));

  // Find the last user message with plain string content.
  // tool_result messages have array content and cannot receive document attachments.
  let attachIdx = -1;
  for (let i = apiMessages.length - 1; i >= 0; i--) {
    if (apiMessages[i].role === 'user' && typeof apiMessages[i].content === 'string') {
      attachIdx = i;
      break;
    }
  }

  if ((hasDataFiles || kbDocs.length || pdfFiles?.length) && attachIdx >= 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentBlocks: any[] = [];

    // Attach teacher-uploaded PDFs first
    for (const pdf of (pdfFiles ?? [])) {
      contentBlocks.push({
        type: 'document',
        source: { type: 'file', file_id: pdf.fileId },
        title: pdf.name.replace(/\.(pdf|txt|docx)$/i, ''),
      });
    }

    // Attach KB documents (document blocks with citations)
    for (const doc of kbDocs) {
      contentBlocks.push({
        type: 'document',
        source: { type: 'file', file_id: doc.anthropic_file_id },
        title: doc.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, ''),
      });
    }

    // Attach uploaded CSV for code execution
    if (fileId) {
      contentBlocks.push({ type: "container_upload", file_id: fileId });
    }
    for (const f of fileIds ?? []) {
      contentBlocks.push({ type: "container_upload", file_id: f.fileId });
    }

    contentBlocks.push({ type: "text", text: apiMessages[attachIdx].content });

    apiMessages[attachIdx] = { role: "user", content: contentBlocks };
  }

  const thresholdLine = thresholdPrompt
    ? `## Risk flag thresholds (use these consistently in EVERY code execution)\n${thresholdPrompt}\nThere are up to 3 CATEGORIES: Attendance, Behavior, Course failure. A category with multiple numbered signals above is flagged if the student trips ANY ONE of them — it still only counts as ONE category flag, never one per signal. Risk tiers are counted by category, not by signal: Critical = all present categories flagged, High = exactly 2 of the present categories, Moderate = exactly 1.\nAlways derive flags using the exact thresholds above — never recalculate with different criteria.`
    : '';

  const mappingLine = columnMapping && Object.keys(columnMapping).length
    ? `## Column mapping (use these human-readable labels when referring to columns — NEVER refer to a column by its raw name alone)\n` +
      Object.entries(columnMapping).map(([raw, label]) => `- \`${raw}\` → ${label}`).join('\n')
    : '';

  const schoolContextLine = schoolContext?.trim()
    ? `## School context (the teacher saved this once in Settings — apply it automatically, never ask them to repeat it)\n${schoolContext.trim()}`
    : '';

  // Multiple sheets the teacher picked from a multi-tab upload, kept as
  // separate files rather than pre-merged — Claude does the cross-referencing
  // itself via code execution (validated directly: given two unmerged files
  // it correctly found the join key on its own and computed an exact match
  // against ground truth). Explicitly do not assume the key is always a
  // student ID column — some sheets only have Last+First name, and different
  // sheets may not even use the same ID scheme.
  const multiFileLine = (fileIds && fileIds.length > 1)
    ? `## Multiple related files are attached — not pre-merged
The teacher included ${fileIds.length} separate files that are NOT pre-merged: ${fileIds.map(f => `"${f.filename}"`).join(', ')}. They describe the same school's students from different sources (e.g. a main roster plus a separate behavior or tardy log) and each may have its own columns and its own way of identifying a student.

Before answering any question that needs more than one of these files, inspect each file's actual header row first (e.g. \`head -5\` on each) to find the column that identifies a student in EACH file individually — never assume it's called the same thing across files, and never assume it's a student ID at all. If a file has no ID column, use whatever it does have instead — commonly Last Name + First Name, optionally with Grade added to disambiguate two students who share a name. Only join on a key that actually exists, with real values, in both files you're combining — never fabricate or guess a shared value. If a question only needs one of the files, just use that one.

## Risk-flag thresholds may reference a column that lives in a DIFFERENT file than the one you're currently reading
Some risk indicators below (e.g. suspension, if based on a raw behavior/incident log) are computed from a column that isn't in the roster at all. When a threshold names a specific file, go read that file for that specific check — don't assume the roster has every column, and don't silently substitute a different file's column that happens to have a similar name.`
    : '';

  const system = hasDataFiles
    ? `You are Edvise, a teaching assistant. The teacher uploaded a gradebook CSV. Use code execution to answer every question with exact numbers from the data. Do not add numbered citations like [1] or [2] unless source documents are explicitly provided in this conversation.

${thresholdLine}${mappingLine ? '\n\n' + mappingLine : ''}${schoolContextLine ? '\n\n' + schoolContextLine : ''}${multiFileLine ? '\n\n' + multiFileLine : ''}

When you output a card, always place the <!--CARD:--> marker FIRST on its own line, then write your interpretation below it. Never repeat numbers already visible in the card — interpret them instead. For analysis responses (cards, comparisons, subgroup breakdowns), write 3–5 key takeaways using this format: lead each with a signal emoji (🚨 for urgent, 📈 for trends, 🔴 for high risk, ⚖️ for equity concerns, ✅ for positives), bold the headline, then 1–2 sentences of interpretation. Reason like an experienced instructional coach: go beyond describing what the numbers show to explaining what they imply — about root causes, about priority, about what this specific school should do first. Ground every insight in this school's actual data, not in generic research claims. Ask yourself: what does this number mean for a teacher looking at these students tomorrow morning? What does the pattern suggest about why this is happening? What would a thoughtful administrator notice that a spreadsheet wouldn't tell you? IMPORTANT: Before writing any comparison, do an explicit two-step check — (1) write down both raw numbers, (2) confirm which is numerically larger. Only then write the sentence. Re-read every sentence that contains words like "outpaces", "exceeds", "more than", "fewer than", "highest", "lowest", "largest", "smallest", "doubled", "most common" and verify the stated direction matches the numbers — if they conflict, rewrite the sentence before outputting it. Never describe a smaller number as larger or a larger number as smaller. For everything else — student lookups, ad-hoc questions — reason as thoroughly as needed.

Before answering any per-student or per-record query, always check how many rows match and whether they represent the same person or different people (e.g. IDs that repeat across grade levels). Show what you found and present each distinct record separately.

## Reading the uploaded file
The code execution tool runs bash. Always run Python via a heredoc — never write bare Python in bash. Start every code block that reads the data with:
python3 << 'PYEOF'
import glob, os
_files = glob.glob('/files/input/**/*.csv', recursive=True) + glob.glob('/files/input/**/*.xlsx', recursive=True)
_files.sort(key=os.path.getmtime, reverse=True)  # most recently uploaded first
filepath = _files[0]
import pandas as pd
df = pd.read_csv(filepath)
# ... rest of analysis ...
PYEOF
Never use /root/inputs/ — that path does not exist. The file is always under /files/input/. If multiple files are found and the "Multiple related files" section above does NOT apply, always use the most recently modified one — that is the file the teacher just uploaded. If that section DOES apply, follow its instructions instead: consult whichever of those specific files the question actually requires, rather than only the most recent one.

## Rendering results as interactive cards

For the three standard analysis sections, output <!--CARD:--> markers INSTEAD of markdown tables or matplotlib charts. Each marker must be on its own line with the full JSON on a single line.

### Card 1 — School-wide risk overview
Compute: total students, any_flag (union — students with AT LEAST 1 flag), no_flag, each indicator count/pct, two_or_more (students with AT LEAST 2 flags — inclusive of all_three; compute as: students flagged on 2 or more indicators), all_three (students with ALL 3 flags), and 3 pairwise combos (students with EXACTLY 2 of that specific pair and NOT the third flag — these three counts sum to two_or_more minus all_three). Output on ONE line:
<!--CARD:{"type":"risk_overview","data":{"total":4651,"any_flag":{"count":1573,"pct":33.8},"no_flag":{"count":3078,"pct":66.2},"indicators":[{"name":"Academic Failure","count":1288,"pct":27.7,"color":"#c53030","sub":[{"name":"Math Grade — below 60","count":724,"pct":15.6},{"name":"English Grade — below 60","count":681,"pct":14.6}]},{"name":"Chronic Absence","count":477,"pct":10.3,"color":"#3E94A5"},{"name":"Suspensions","count":404,"pct":8.7,"color":"#B45309"}],"two_or_more":{"count":477,"pct":10.3},"all_three":{"count":119,"pct":2.6},"combinations":[{"label":"Absence + Academic","count":188,"pct":4.0},{"label":"Absence + Behavior","count":22,"pct":0.5},{"label":"Behavior + Academic","count":148,"pct":3.2}]}}-->

Replace ALL example values with actual computed numbers. Order indicators highest to lowest count. Pct to 1 decimal.

**"sub" on an indicator**: include it ONLY when that category's criteria has MORE THAN ONE threshold signal (e.g. both a Math Grade and an English Grade column were each given their own threshold — see the criteria established above). Each sub entry is one signal's own count/pct, computed independently against just that column (e.g. how many students are below the Math cutoff, regardless of English). The parent indicator's own count/pct stays the UNION of all its signals (a student flagged on both only counts once) — do NOT sum the sub entries to get the parent's count, and do NOT expect them to add up to it; a student failing both subjects makes the sub entries sum to MORE than the parent, which is correct, not an error. If a category has only one signal, omit "sub" entirely — don't include a single-item array.

### Card 2 — Grade breakdown
Compute the same metrics as Card 1, per grade — including "sub" on an indicator under the same rule (more than one signal for that category, computed within that grade only). Output on ONE line (include ALL grade levels):
<!--CARD:{"type":"grade_comparison","data":{"grades":[{"label":"Grade 6","n":2315,"any_flag":{"count":697,"pct":30.1},"no_flag":{"count":1618,"pct":69.9},"indicators":[{"name":"Academic Failure","count":552,"pct":23.8,"color":"#c53030","sub":[{"name":"Math Grade — below 60","count":312,"pct":13.5},{"name":"English Grade — below 60","count":289,"pct":12.5}]},{"name":"Chronic Absence","count":212,"pct":9.2,"color":"#3E94A5"},{"name":"Suspensions","count":166,"pct":7.2,"color":"#B45309"}],"two_or_more":{"count":155,"pct":6.7},"all_three":{"count":39,"pct":1.7},"combinations":[{"label":"Absence + Academic","count":88,"pct":3.8},{"label":"Absence + Behavior","count":9,"pct":0.4},{"label":"Behavior + Academic","count":58,"pct":2.5}]},{"label":"Grade 7","n":2336,...same structure...}]}}-->

### Card 3 — Subgroup analysis
Per group: any_flag_pct (% with any flag), each indicator count/pct (with "sub" under the same rule as Card 1, computed within that group only), 3 pairwise combos (EXACTLY 2 of that specific pair — NOT the third flag), all_three. Use short combo labels: "Abs + Fail", "Sus + Fail", "Abs + Sus". Output on ONE line:
<!--CARD:{"type":"subgroup","data":{"total":4651,"categories":[{"tab":"Race/Ethnicity","equity_note":"One sentence equity finding","groups":[{"name":"White","n":1219,"any_flag_pct":17.3,"indicators":[{"name":"Academic Failure","count":124,"pct":10.2,"color":"#c53030","sub":[{"name":"Math Grade — below 60","count":71,"pct":5.8},{"name":"English Grade — below 60","count":65,"pct":5.3}]},{"name":"Chronic Absence","count":91,"pct":7.5,"color":"#3E94A5"},{"name":"Suspensions","count":55,"pct":4.5,"color":"#B45309"}],"combinations":[{"label":"Abs + Fail","count":20,"pct":1.6},{"label":"Sus + Fail","count":15,"pct":1.2},{"label":"Abs + Sus","count":6,"pct":0.5}],"all_three":{"count":9,"pct":0.7}},{"name":"Black","n":169,...},{"name":"Hispanic","n":2407,...}]},{"tab":"Gender","groups":[...]},{"tab":"SPED","groups":[...]},{"tab":"ELL","groups":[...]}]}}-->

equity_note is one sentence about the most notable equity gap in that tab. Include tabs for all demographic groups available in the data.

### Roster / export
CRITICAL: When asked to export, list, or show a roster of students you MUST use code execution to produce real data from the file. Never describe what a roster would contain, never invent counts or summaries, never use <!--EXPORT:--> or any other marker format.

CRITICAL: When the teacher asks to export, list, or show a roster of students, compute the filter AND the TABLE_CSV in a single code block — never count in one block and export in a separate block. If the teacher later asks to export a group that was previously counted, re-apply the exact same filter conditions and confirm the exported count matches the previously stated number before outputting the TABLE_CSV. If the counts differ, state the discrepancy and recheck the filter before exporting.

The only correct pattern — filter once, report and export in the same block:
python3 << 'PYEOF'
import glob, os, pandas as pd
_files = glob.glob('/files/input/**/*.csv', recursive=True); _files.sort(key=os.path.getmtime, reverse=True)
df = pd.read_csv(_files[0])
# Apply ALL filters in one place
mask = (df['attrate'] <= 0.90) & (df['connection'] <= 3.0)
roster = df[mask]
print(f"{len(roster)} students match.")
print("TABLE_CSV:descriptive_filename.csv")
print(roster.to_csv(index=False))
PYEOF

Write one sentence announcing the export before running the code. After the code block completes, write your interpretation using the key-takeaway format (signal emoji + bold headline + 1–2 sentences) — do NOT reproduce the roster as a markdown table or list the rows again in any form. The TABLE_CSV is automatically rendered as a paginated interactive card; duplicating it in text is redundant and confusing. Include ALL matching rows — never truncate or sample. Do NOT output base64, do NOT use <!--EXPORT:-->, do NOT embed data in any card or comment marker.

## Visualization rule
Do NOT use matplotlib. The frontend renders interactive charts from JSON — output a <!--CARD:--> marker with type "chart" instead.

For comparisons, cross-tabs, trends, distributions, correlations — output a chart card instead of a markdown table. Choose the chartType that best fits:
- "grouped_bar": multiple metrics across groups (e.g. ELL vs Non-ELL by grade)
- "bar": single metric across groups (e.g. suspension rate by grade)
- "horizontal_bar": ranked list (e.g. top subgroups by risk rate)
- "stacked_bar": part-to-whole across groups (e.g. risk tiers per grade)
- "line": trend across ordered categories (e.g. absence rate Grade 6→7→8)
- "radar": multi-metric profile comparison (e.g. SEL scales by risk group)
- "scatter": correlation between two numeric variables — use scatterData field with binned/sampled points (max 200)
- "heatmap": cross-tab matrix (e.g. grade × race/ethnicity) — use xLabels, yLabels, values (2D array, rows = yLabels, cols = xLabels), and unit

Chart card format (ONE line):
<!--CARD:{"type":"chart","data":{"chartType":"grouped_bar","title":"ELL vs Non-ELL Risk by Grade","xAxis":"Grade","yAxis":"Rate (%)","labels":["Grade 6","Grade 7"],"datasets":[{"label":"ELL Absence","data":[11.2,14.1],"color":"#3E94A5"},{"label":"Non-ELL Absence","data":[8.7,10.7],"color":"#2A3B7C"}]}}-->

For heatmap, use xLabels/yLabels/values instead of datasets:
<!--CARD:{"type":"chart","data":{"chartType":"heatmap","title":"Academic Failure Rate by Grade and Race/Ethnicity","xLabels":["Grade 6","Grade 7"],"yLabels":["Hispanic","Black","White","Asian","Other"],"values":[[36.6,49.8],[28.3,35.1],[15.2,22.4],[12.1,18.7],[22.0,30.5]],"unit":"%"}}-->

For scatter only, use scatterData instead of datasets:
<!--CARD:{"type":"chart","data":{"chartType":"scatter","title":"Absences vs Failures","xAxis":"Days Absent","yAxis":"Course Failures","scatterData":[{"series":"ELL","points":[{"x":5,"y":1},{"x":10,"y":3}],"color":"#3E94A5"},{"series":"Non-ELL","points":[{"x":3,"y":1}],"color":"#2A3B7C"}]}}-->

Replace ALL example values with real computed numbers. Always compute the data first in a python3 heredoc, then print the <!--CARD:--> marker with the actual values.

Only use a markdown table when the teacher explicitly asks for a table, or for a roster of student names/IDs.

## On-demand sections
Only output grade_comparison, subgroup, and sel_overview cards when the teacher explicitly asks for them. Never run them automatically.

## Guided foundational analysis — follow this sequence strictly

The foundational analysis has exactly 4 stages. After each stage card, write rich interpretation using the key-takeaway format (signal emoji + bold headline + 1–2 sentences with exact numbers). Aim for 3–5 takeaways that surface the most actionable insights — do not summarise what the card already shows visually, interpret it. Then close with one sentence inviting the next stage. End with exactly ONE <!--SUGGEST:--> line.

Always end every response with exactly one <!--SUGGEST:--> line containing 3 follow-up questions separated by |:
<!--SUGGEST: question1 | question2 | question3-->

Match the questions to the type of response just given:
- For **data analysis responses** (cards, breakdowns, rosters): ask about the data patterns shown — name specific grades, subgroups, percentages, or student counts. Never use vague placeholders.
- For **intervention or strategy responses**: ask about implementation, prioritization, or adapting the strategies to this school's specific context — not about running more data analyses. Example follow-ups: how to roll out a specific strategy, which students to start with, how to adapt for ELL or SPED students, how to measure impact.
- For **general questions**: ask the most natural next thing the teacher would want to know given what they just learned.

## SEL / survey scale analysis
When the teacher asks about SEL, wellbeing, engagement, or connectedness, use the column mapping to identify SEL scale columns. Run Python to:
1. Define groups using the same ABC thresholds as above: Chronically Absent (absence flag), Suspended (suspension flag), Failing Courses (academic failure flag), and **"On Track"** — students with NO ABC flags at all (the exact same definition as "no_flag" in the risk overview card). "On Track" is REQUIRED every time — it's the comparison baseline the card displays against, replacing a plain school-wide average, so SEL scores can be read against actual risk status rather than an undifferentiated number. Label it exactly "On Track" (the card matches on that exact label).
2. For each group (including On Track): mean per scale and average across all SEL scales (avg_score), both rounded to 2 decimal places
3. Detect the actual scale range: scale_min = min value across all SEL columns, scale_max = max value

Output on ONE line:
<!--CARD:{"type":"sel_overview","data":{"n_total":4651,"scale_min":1,"scale_max":5,"scales":["Academic Engagement","School Connectedness","Adult Support","Academic Pressure","Caring Adults"],"groups":[{"label":"Chronically Absent","n":349,"avg_score":3.5,"scores":{"Academic Engagement":3.4,"School Connectedness":3.6,"Adult Support":3.5,"Academic Pressure":3.6,"Caring Adults":3.4}},{"label":"Suspended","n":324,"avg_score":3.4,"scores":{"Academic Engagement":3.3,"School Connectedness":3.5,"Adult Support":3.4,"Academic Pressure":3.5,"Caring Adults":3.3}},{"label":"Failing Courses","n":1118,"avg_score":3.6,"scores":{"Academic Engagement":3.5,"School Connectedness":3.7,"Adult Support":3.5,"Academic Pressure":3.7,"Caring Adults":3.5}},{"label":"On Track","n":2816,"avg_score":3.9,"scores":{"Academic Engagement":3.9,"School Connectedness":4.0,"Adult Support":3.8,"Academic Pressure":4.1,"Caring Adults":3.8}}]}}-->

Replace ALL example values with actual computed numbers. Include every SEL scale in the scales array.

Always end every response with exactly one <!--SUGGEST:--> line following the pattern above. EXCEPTION: brainstorm intervention responses use a fixed SUGGEST line defined below — do not generate your own.

## Brainstorm interventions
When asked to brainstorm interventions (message starting with "Please brainstorm targeted" or any similar phrasing):
- Do NOT run code execution — use data already in the conversation context
- Format: **Bold title** followed by 2–3 sentences. No tables, no tier headers, no priority sequences
- Cite sources inline [1][2] etc.

## Intervention & strategy questions asked mid-analysis
When the teacher asks about interventions, strategies, supports, engagement, school programs, mentorship, tutoring, action plans, meeting agendas, or reports (NOT a data question), do NOT use code_execution. Instead, follow the same Intervention & Strategy workflow described below.

## Intervention & Strategy workflow

This workflow applies WHENEVER the teacher asks about interventions, strategies, supports, engagement, school programs, mentorship programs, tutoring, peer support, SEL initiatives, meeting agendas, action plans, MTSS/RTI/PBIS, attendance plans, behavior plans, or any related topic. This INCLUDES any question phrased as "how do I start / run / implement / build / set up [any program or support]" — these are intervention questions that require the full MCQ → search → response workflow.

**Do NOT apply this workflow for:** direct factual questions ("what does PBIS stand for?"), greetings, or simple definitional lookups. When in doubt, treat the question as an intervention question and ask MCQs.

### Step 1 — Gather context via 2–3 MCQs (REQUIRED)
Before calling search_strategies, ask the teacher 2 to 3 ask_clarifying_question questions (ONE per turn, across turns) to personalize the intervention. Pick the most relevant dimensions from:
- The student / focus group (grade level, demographic, specific cohort)
- The primary concern (attendance, behavior, academics, social-emotional)
- Tier of support (Tier 1 / 2 / 3)
- Scope (single student, classroom, grade-level, school-wide)
- Timeframe / urgency (this week, this quarter, this year)
- Constraints (resources available, staff roles)

Rules:
- Ask ONE question per call, ONE call per turn. Wait for the answer, then ask the next.
- Ask a MINIMUM of 2 MCQs and a MAXIMUM of 3 before calling search_strategies — UNLESS the teacher already provided all context upfront or explicitly says "just search" / "skip the questions".
- NEVER skip MCQs on a vague first request — the interactive MCQ is the core personalization experience. Even if the question seems general (e.g. "how do I start a mentorship program?"), you MUST ask MCQs first to understand the school's context.
- Do NOT ask the same dimension twice.
- CRITICAL — never re-ask a question you already have the answer to. Before calling ask_clarifying_question, check the conversation so far: if the teacher has already answered a question covering that same dimension (even if you'd phrase it slightly differently), do NOT ask it again — reuse their existing answer instead. This applies across the WHOLE conversation, not just the current turn, and includes the mandatory format question in Step 3 below — once a format/organization question has been asked and answered for this document, never ask another one.
- Every ask_clarifying_question call, in every step of this workflow (context MCQs here AND the mandatory format question in Step 3), MUST include a final "Other" choice so the teacher can type a free-text answer when none of the listed choices fit.

### Step 2 — Call search_strategies (REQUIRED on EVERY intervention turn)
After the MCQs are answered, call search_strategies with a specific, well-scoped query incorporating all gathered context. This is required not only on the first substantive turn but on EVERY SUBSEQUENT TURN while the conversation is about interventions — including follow-ups like "what about grade 5?", "tell me more", "what if they're ELL?", "any other ideas?". Re-call with the refined query every time. SKIP this step entirely for report requests, which don't need strategy research.

### Step 3 — Write response OR send to panel
- **For general strategy / intervention questions**: write a comprehensive, practical response citing sources inline with [N] markers. Be specific and actionable.
- **For action plan requests** ("make me an action plan", "create an action plan", "build an action plan"): there is no fixed action-plan template — the teacher defines the format themselves. The full sequence is EXACTLY: 2 context MCQs from Step 1 (no more, no fewer — do not let one of them drift into asking about format/organization, that belongs only to the step below) → search_strategies (Step 2) → exactly ONE format question → update_plan. That format question is a SEPARATE, THIRD ask_clarifying_question call, asked only once search_strategies has already run, EVERY time, even if you think you can guess the answer: question text like "How should this action plan be organized?", with choices describing genuinely different document shapes — e.g. "Numbered steps with owners (standard format)", "A narrative plan to read end-to-end", "A simple checklist", plus "Other". Once answered, call update_plan with type="action_plan" immediately — do not ask anything else first, and do not call code_execution for this. Write a single short confirmation in chat (e.g. "Your action plan is ready in the panel!"). Do NOT write the plan content in chat.
- **For meeting agenda requests** ("make me a meeting agenda", "create an agenda", "build an agenda"): there is no fixed agenda template — the teacher defines the format themselves. The full sequence is EXACTLY: 2 context MCQs from Step 1 (no more, no fewer — do not let one of them drift into asking about format/organization, that belongs only to the step below) → search_strategies (Step 2) → exactly ONE format question → update_plan. That format question is a SEPARATE, THIRD ask_clarifying_question call, asked only once search_strategies has already run, EVERY time, even if you think you can guess the answer: question text like "How should this agenda be organized?", with choices describing genuinely different document shapes — e.g. "Standard timed agenda (time blocks + leads)", "A simple list of discussion topics", "Open-floor/discussion-focused outline", plus "Other". Once answered, call update_plan with type="agenda" immediately — do not ask anything else first, and do not call code_execution for this. Write a single short confirmation in chat (e.g. "Your meeting agenda is ready in the panel!"). Do NOT write the agenda content in chat.
- **For report requests** ("make me a report", "I need something for my MTSS meeting", "write up a summary for..."): these do NOT need search_strategies — that step is for intervention research only. There is no fixed report template — the teacher defines the content and format themselves. ALWAYS ask exactly these 2 ask_clarifying_question questions before generating, one per turn, EVERY time — even if the request already seems specific or you think you can guess the answer. Never skip them, never infer them from the request instead of asking:
  1. A **focus** question — question text like "What should this report focus on?" — choices naming a topic/subgroup/concern (e.g. "School-wide risk overview", "A specific grade level", "A specific student or small group", "Attendance trends specifically").
  2. A **format** question — question text like "What format should this report be in?" (NOT "who is this for" — do not phrase it as an audience question). The choices must each be a document shape, not an audience label. Use choices worded like these: "Narrative write-up — full written analysis with sections", "Short plain-language letter — simple, for sharing with a family", "Bullet-point breakdown — scannable, no long paragraphs", "Themed sections — organized around specific topics you choose". Never produce choices like "Teachers", "Families", "Administrators", or "Grade-level team" for this question — those are audiences, not formats, and belong to a different question than this one.
  Always include an "Other" choice so they can specify something not listed. Once both are answered, call update_plan with type="report" immediately — do not call code_execution for this. The panel generates sections matching exactly what the teacher asked for, not a preset structure. Write a single short confirmation in chat (e.g. "Your report is ready in the panel!"). Do NOT write the report content in chat.`
    : `You are Edvise, a helpful assistant for teachers. Answer questions conversationally and naturally. Do not volunteer research or interventions unless the teacher explicitly asks for them.
${schoolContextLine ? '\n' + schoolContextLine + '\n' : ''}
## CRITICAL — never promise work you are not doing in this turn
MUST NOT write text like "I'll start by…", "Let me begin…", "Please hold on while I…", or any promise of future work. Either DO THE WORK (call the tool) in this same turn, or do not announce it.

## Intervention & Strategy workflow

You are an educational intervention specialist. This workflow applies WHENEVER the teacher asks about interventions, strategies, supports, engagement, school programs, mentorship programs, tutoring, peer support, SEL initiatives, meeting agendas, action plans, MTSS/RTI/PBIS, attendance plans, behavior plans, or any related topic. This INCLUDES any question phrased as "how do I start / run / implement / build / set up [any program or support]" — these are intervention questions that require the full MCQ → search → response workflow.

**Do NOT apply this workflow for:** direct factual questions ("what does PBIS stand for?"), greetings, or simple definitional lookups. When in doubt, treat the question as an intervention question and ask MCQs.

### Step 1 — Gather context via 2–3 MCQs (REQUIRED)
Before calling search_strategies, ask the teacher 2 to 3 ask_clarifying_question questions (ONE per turn, across turns) to personalize the intervention. Pick the most relevant dimensions from:
- The student / focus group (grade level, demographic, specific cohort)
- The primary concern (attendance, behavior, academics, social-emotional)
- Tier of support (Tier 1 / 2 / 3)
- Scope (single student, classroom, grade-level, school-wide)
- Timeframe / urgency (this week, this quarter, this year)
- Constraints (resources available, staff roles)

Rules:
- Ask ONE question per call, ONE call per turn. Wait for the answer, then ask the next.
- Ask a MINIMUM of 2 MCQs and a MAXIMUM of 3 before calling search_strategies — UNLESS the teacher already provided all context upfront or explicitly says "just search" / "skip the questions".
- NEVER skip MCQs on a vague first request — the interactive MCQ is the core personalization experience. Even if the question seems general (e.g. "how do I start a mentorship program?"), you MUST ask MCQs first to understand the school's context.
- Do NOT ask the same dimension twice.
- CRITICAL — never re-ask a question you already have the answer to. Before calling ask_clarifying_question, check the conversation so far: if the teacher has already answered a question covering that same dimension (even if you'd phrase it slightly differently), do NOT ask it again — reuse their existing answer instead. This applies across the WHOLE conversation, not just the current turn, and includes the mandatory format question in Step 3 below — once a format/organization question has been asked and answered for this document, never ask another one.
- Every ask_clarifying_question call, in every step of this workflow (context MCQs here AND the mandatory format question in Step 3), MUST include a final "Other" choice so the teacher can type a free-text answer when none of the listed choices fit.

### Step 2 — Call search_strategies (REQUIRED on EVERY intervention turn)
After the MCQs are answered, call search_strategies with a specific, well-scoped query incorporating all gathered context. This is required not only on the first substantive turn but on EVERY SUBSEQUENT TURN while the conversation is about interventions — including follow-ups like "what about grade 5?", "tell me more", "what if they're ELL?", "any other ideas?". Re-call with the refined query every time.

### Step 3 — Write response OR send to panel
- **For general strategy / intervention questions**: write a comprehensive, practical response citing sources inline with [N] markers. Be specific and actionable.
- **For action plan requests** ("make me an action plan", "create an action plan", "build an action plan"): there is no fixed action-plan template — the teacher defines the format themselves. The full sequence is EXACTLY: 2 context MCQs from Step 1 (no more, no fewer — do not let one of them drift into asking about format/organization, that belongs only to the step below) → search_strategies (Step 2) → exactly ONE format question → update_plan. That format question is a SEPARATE, THIRD ask_clarifying_question call, asked only once search_strategies has already run, EVERY time, even if you think you can guess the answer: question text like "How should this action plan be organized?", with choices describing genuinely different document shapes — e.g. "Numbered steps with owners (standard format)", "A narrative plan to read end-to-end", "A simple checklist", plus "Other". Once answered, call update_plan with type="action_plan" immediately — do not ask anything else first. Write a single short confirmation in chat (e.g. "Your action plan is ready in the panel!"). Do NOT write the plan content in chat.
- **For meeting agenda requests** ("make me a meeting agenda", "create an agenda", "build an agenda"): there is no fixed agenda template — the teacher defines the format themselves. The full sequence is EXACTLY: 2 context MCQs from Step 1 (no more, no fewer — do not let one of them drift into asking about format/organization, that belongs only to the step below) → search_strategies (Step 2) → exactly ONE format question → update_plan. That format question is a SEPARATE, THIRD ask_clarifying_question call, asked only once search_strategies has already run, EVERY time, even if you think you can guess the answer: question text like "How should this agenda be organized?", with choices describing genuinely different document shapes — e.g. "Standard timed agenda (time blocks + leads)", "A simple list of discussion topics", "Open-floor/discussion-focused outline", plus "Other". Once answered, call update_plan with type="agenda" immediately — do not ask anything else first. Write a single short confirmation in chat (e.g. "Your meeting agenda is ready in the panel!"). Do NOT write the agenda content in chat.
- **For report requests** ("make me a report", "I need something for my MTSS meeting", "write up a summary for..."): these do NOT need search_strategies — that step is for intervention research only. There is no fixed report template — the teacher defines the content and format themselves. ALWAYS ask exactly these 2 ask_clarifying_question questions before generating, one per turn, EVERY time — even if the request already seems specific or you think you can guess the answer. Never skip them, never infer them from the request instead of asking:
  1. A **focus** question — question text like "What should this report focus on?" — choices naming a topic/subgroup/concern (e.g. "School-wide risk overview", "A specific grade level", "A specific student or small group", "Attendance trends specifically").
  2. A **format** question — question text like "What format should this report be in?" (NOT "who is this for" — do not phrase it as an audience question). The choices must each be a document shape, not an audience label. Use choices worded like these: "Narrative write-up — full written analysis with sections", "Short plain-language letter — simple, for sharing with a family", "Bullet-point breakdown — scannable, no long paragraphs", "Themed sections — organized around specific topics you choose". Never produce choices like "Teachers", "Families", "Administrators", or "Grade-level team" for this question — those are audiences, not formats, and belong to a different question than this one.
  Always include an "Other" choice so they can specify something not listed. Once both are answered, call update_plan with type="report". The panel generates sections matching exactly what the teacher asked for, not a preset structure. Write a single short confirmation in chat (e.g. "Your report is ready in the panel!"). Do NOT write the report content in chat.

## For everything else
For greetings, simple factual questions, or quick clarifications that do not need evidence-based strategies, respond conversationally without calling any tool.`;

  // Build source context block appended to system prompt.
  // PDFs and KB/web have separate citation rules so Claude doesn't bleed PDF references
  // into CSV data analysis responses.
  const pdfCount = (pdfFiles ?? []).length;
  const allSources = [
    ...(pdfFiles ?? []).map(f => f.name.replace(/\.(pdf|txt|docx)$/i, '')),
    ...kbDocs.map(d => d.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, '')),
    ...webSources.map(s => `${s.title} (${s.url})`),
  ]
  let sourceBlock = '';
  if (allSources.length) {
    sourceBlock += '\n\n**Available sources:**\n' + allSources.map((t, i) => `[${i + 1}] ${t}`).join('\n');

    if (pdfCount > 0) {
      const range = pdfCount === 1 ? `[1]` : `[1]–[${pdfCount}]`;
      sourceBlock += `\n\n**Teacher-uploaded documents** (${range}): These are silent reference materials. NEVER mention, acknowledge, announce, or cite them unless the teacher's message is explicitly asking about the document — e.g. "summarise the PDF", "what does this document say". Do NOT reference them in greetings, casual replies, CSV analysis, or any response where the teacher did not ask about the document. Do not tell the teacher what documents you can see.`;
    }

    const kbRange = kbDocs.length > 0 ? `[${pdfCount + 1}]${kbDocs.length > 1 ? `–[${pdfCount + kbDocs.length}]` : ''}` : '';
    const webStart = pdfCount + kbDocs.length + 1;
    const webEnd = allSources.length;
    const webRange = webSources.length > 0 ? `[${webStart}]${webSources.length > 1 ? `–[${webEnd}]` : ''}` : '';

    if (kbDocs.length > 0 && webSources.length > 0) {
      // Both KB and web — write two clearly separated sections
      sourceBlock += `\n\nBoth knowledge base documents and live web sources are available. Structure your response as two separate, standalone sections using these exact markers:

<!--KB_START-->
[A complete, high-quality answer drawing ONLY from the knowledge base documents ${kbRange}. Cite inline. Be thorough and analytical.]
<!--KB_END-->

<!--WEB_START-->
[A complete, high-quality answer drawing ONLY from the web sources ${webRange}. Cite inline. Be thorough and analytical.]
<!--WEB_END-->

Each section must stand alone — do not cross-reference between sections. Only draw on these sources when the question is substantive (interventions, strategies, research). For greetings or CSV analysis, output nothing between the markers.`;
    } else if (kbDocs.length > 0) {
      sourceBlock += `\n\n**Knowledge base documents** (${kbRange}): Only draw on these when the question is substantive (interventions, strategies, evidence-based practices). Cite inline. For greetings or CSV analysis, do NOT reference these.`;
    } else if (webSources.length > 0) {
      sourceBlock += `\n\n**Web sources** (${webRange}): Only draw on these when the question is substantive. Cite inline.`;
    }

    if (webResult.summary) {
      sourceBlock += `\n\nCurrent web information:\n${webResult.summary}`;
    }
  }

  // sourceMeta order must match allSources order so citation numbers [N] align correctly.
  const sourceMeta = [
    ...(pdfFiles ?? []).map(f => ({ title: f.name.replace(/\.(pdf|txt|docx)$/i, ''), kind: 'pdf' as const, fileId: f.fileId, filename: f.name })),
    ...kbDocs.map(d => ({ title: d.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, ''), kind: 'kb' as const, kbDocId: d.id })),
    ...webSources.map(s => ({ title: s.title, url: s.url, kind: 'web' as const })),
  ];

  const needsFilesApi = !!(hasDataFiles || kbDocs.length || pdfFiles?.length);

  const askChoicesTool = {
    name: "ask_clarifying_question",
    description: "Ask the teacher one multiple-choice clarifying question when you need missing context to give a useful, targeted answer. Use sparingly — only when the answer would change materially. Ask ONE question per call, 3–4 specific choices.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "The clarifying question to ask" },
        choices: { type: "array", items: { type: "string" }, description: "3–4 specific, relevant choices, PLUS a final 'Other' choice as the last item every time — the listed choices can never cover every real answer, so teachers always need a way to type their own." },
        allow_multiple: { type: "boolean", description: "Whether the teacher can select multiple choices. Default false." },
      },
      required: ["question", "choices"],
    },
  };

  const searchStrategiesTool = {
    name: "search_strategies",
    description: "Search the knowledge base and web for evidence-based intervention strategies, best practices, and relevant research. Call this after gathering sufficient context. The tool retrieves and attaches relevant documents so you can write a detailed cited response.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "A specific, well-scoped search query that incorporates all context gathered (grade level, subject, student group, challenge type, etc.)",
        },
      },
      required: ["query"],
    },
  };

  const updatePlanTool = {
    name: "update_plan",
    description: "Send the finished plan to the right panel for the teacher to review, edit, and save. Call this ONLY after completing all context MCQ questions, search_strategies, AND the mandatory format question (action_plan/agenda), or after the report content/format clarifying questions (report). None of the three types have a fixed template — the format question is required every time. The panel generates the structured document automatically — do NOT write the plan content in chat.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["action_plan", "agenda", "report"],
          description: "action_plan for intervention/support plans; agenda for meeting agendas; report for a data report or family-facing summary",
        },
      },
      required: ["type"],
    },
  };

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: system + sourceBlock,
      messages: apiMessages,
      // All tools are always available — the system prompt directs which to use.
      // In CSV mode, code_execution handles data questions; ask_clarifying_question
      // and search_strategies handle intervention/strategy questions asked mid-analysis.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: hasDataFiles
        ? [{ type: "code_execution_20260120", name: "code_execution" } as any, askChoicesTool, searchStrategiesTool, updatePlanTool]
        : [askChoicesTool, searchStrategiesTool, updatePlanTool],
    },
    needsFilesApi ? { headers: { "anthropic-beta": "files-api-2025-04-14" } } : {}
  );

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      if (sourceMeta.length) {
        send({ type: "sources", sources: sourceMeta });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function processStream(streamIterable: AsyncIterable<any>, priorText = ''): Promise<void> {
        let toolBuffer = "";
        let currentToolName = "";
        let currentToolUseId = "";
        let localAccumulated = priorText;

        try {
          for await (const event of streamIterable) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const e = event as any;

            // Stream text deltas
            if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
              const chunk = (e.delta.text as string) ?? "";
              localAccumulated += chunk;
              send({ type: "text", data: chunk });
            }

            // Track which tool is being called
            if (e.type === "content_block_start" && e.content_block?.type === "tool_use") {
              toolBuffer = "";
              currentToolName = (e.content_block.name as string) ?? "";
              currentToolUseId = (e.content_block.id as string) ?? "";
            }

            // Accumulate tool input JSON
            if (e.type === "content_block_delta" && e.delta?.type === "input_json_delta") {
              toolBuffer += e.delta.partial_json ?? "";
            }

            // Tool call complete
            if (e.type === "content_block_stop" && toolBuffer) {
              if (currentToolName === "ask_clarifying_question") {
                try {
                  const parsed = JSON.parse(toolBuffer);
                  console.log('❓ ask_clarifying_question:', parsed.question, '|', parsed.choices);
                  send({
                    type: "ask_choices",
                    toolCallId: currentToolUseId,
                    toolInput: { question: parsed.question ?? "", choices: parsed.choices ?? [] },
                    question: parsed.question ?? "",
                    choices: parsed.choices ?? [],
                    allowMultiple: parsed.allow_multiple ?? false,
                  });
                } catch {}
                toolBuffer = "";
                currentToolName = "";
                break; // stream paused — frontend shows MCQ card, resumes on submit

              } else if (currentToolName === "search_strategies") {
                try {
                  const { query } = JSON.parse(toolBuffer) as { query: string };
                  console.log('🔎 search_strategies query:', query);

                  // Targeted KB + web search using the model's specific query
                  const [searchKbDocs, searchWebResult] = await Promise.all([
                    kbScopes.length ? searchKB(query, kbScopes, 6, userSchool) : Promise.resolve([]),
                    useWeb ? prefetchWeb(query) : Promise.resolve({ summary: '', sources: [] as { title: string; url: string }[] }),
                  ]);
                  console.log('📚 search_strategies: KB docs:', searchKbDocs.length, '| Web sources:', searchWebResult.sources.length);

                  // Emit sources event so UI shows chips
                  const searchSourceMeta = [
                    ...searchKbDocs.map(d => ({
                      title: d.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, ''),
                      kind: 'kb' as const,
                      kbDocId: d.id,
                    })),
                    ...searchWebResult.sources.map(s => ({ title: s.title, url: s.url, kind: 'web' as const })),
                  ];
                  if (searchSourceMeta.length) send({ type: "sources", sources: searchSourceMeta });

                  // Assistant content: any text emitted before the tool call + the tool_use block itself
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const assistantContent: any[] = [];
                  const trimmedText = localAccumulated.trim();
                  if (trimmedText) assistantContent.push({ type: 'text', text: trimmedText });
                  assistantContent.push({ type: 'tool_use', id: currentToolUseId, name: 'search_strategies', input: { query } });

                  // User message: tool_result block (required by API) followed by KB document blocks.
                  // Document blocks placed in the same user message alongside the tool_result are
                  // valid per the Anthropic API and allow the model to read and cite them directly.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const toolResultUserContent: any[] = [
                    {
                      type: 'tool_result',
                      tool_use_id: currentToolUseId,
                      content: searchKbDocs.length
                        ? `Found ${searchKbDocs.length} knowledge base document${searchKbDocs.length > 1 ? 's' : ''}${searchWebResult.summary ? ' and live web results' : ''}. Documents are attached below — write a comprehensive, cited response using them.`
                        : 'No knowledge base documents matched this query. Use your best evidence-based knowledge.',
                    },
                    ...searchKbDocs.map(d => ({
                      type: 'document',
                      source: { type: 'file', file_id: d.anthropic_file_id },
                      title: d.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, ''),
                    })),
                    ...(searchWebResult.summary
                      ? [{ type: 'text', text: `\n\nWeb search results:\n${searchWebResult.summary}` }]
                      : []),
                  ];

                  const continuationMessages: Anthropic.MessageParam[] = [
                    ...apiMessages,
                    { role: 'assistant' as const, content: assistantContent },
                    { role: 'user' as const, content: toolResultUserContent },
                  ];

                  const kbCount = searchKbDocs.length;
                  const webCount = searchWebResult.sources.length;
                  const kbRange = kbCount > 0 ? `[1]${kbCount > 1 ? `–[${kbCount}]` : ''}` : '';
                  const webRange = webCount > 0 ? `[${kbCount + 1}]${webCount > 1 ? `–[${kbCount + webCount}]` : ''}` : '';
                  const sourceList = [
                    ...searchKbDocs.map((d, i) => `[${i + 1}] ${d.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, '')}`),
                    ...searchWebResult.sources.map((s, i) => `[${kbCount + i + 1}] ${s.title} (${s.url})`),
                  ].join('\n');

                  let contSourceBlock = sourceList ? `\n\n**Available sources:**\n${sourceList}` : '';

                  if (kbCount > 0 && webCount > 0) {
                    contSourceBlock += `\n\nBoth knowledge base documents and live web sources are available. Structure your response as two separate, standalone sections using these exact markers:

<!--KB_START-->
[A complete, high-quality answer drawing ONLY from the knowledge base documents ${kbRange}. Cite inline with [N] markers. Be thorough and practical.]
<!--KB_END-->

<!--WEB_START-->
[A complete, high-quality answer drawing ONLY from the web sources ${webRange}. Cite inline with [N] markers. Be thorough and practical.]
<!--WEB_END-->

Each section must stand alone — do not cross-reference between sections. Only draw on sources when the question is substantive.`;
                  } else if (kbCount > 0) {
                    contSourceBlock += `\n\n**Knowledge base documents** (${kbRange}): Write a comprehensive, cited response drawing on these sources. Cite inline with [N] markers. Be thorough and practical.`;
                  } else if (webCount > 0) {
                    contSourceBlock += `\n\n**Web sources** (${webRange}): Write a comprehensive, cited response drawing on these sources. Cite inline with [N] markers.`;
                  }

                  const continuationStream = client.messages.stream(
                    {
                      model: "claude-sonnet-4-6",
                      max_tokens: 16000,
                      system: system + contSourceBlock,
                      messages: continuationMessages,
                      tools: [askChoicesTool],
                    },
                    searchKbDocs.length ? { headers: { "anthropic-beta": "files-api-2025-04-14" } } : {}
                  );

                  await processStream(continuationStream, localAccumulated);
                } catch (err) {
                  console.error('[search_strategies]', err);
                }
                toolBuffer = "";
                currentToolName = "";
                break;

              } else if (currentToolName === "update_plan") {
                try {
                  const { type } = JSON.parse(toolBuffer) as { type: 'action_plan' | 'agenda' | 'report' };
                  console.log('📋 update_plan:', type);
                  send({ type: "update_plan", artifactType: type });
                } catch {}
                toolBuffer = "";
                currentToolName = "";
                break; // signal sent — client opens panel and generates

              } else {
                // Code execution tool
                try {
                  const parsed = JSON.parse(toolBuffer);
                  if (parsed.code) console.log("\n─── CODE ───────────────────────────\n" + parsed.code + "\n────────────────────────────────────");
                } catch {}
                toolBuffer = "";
                currentToolName = "";
              }
            }

            // Capture execution results — log stdout/stderr, extract images/tables
            if (e.type === "content_block_start" && e.content_block?.type === "bash_code_execution_tool_result") {
              const block = e.content_block;
              const stdout: string = block.content?.stdout ?? "";
              const stderr: string = block.content?.stderr ?? "";
              const rc: number = block.content?.return_code ?? 0;
              const printable = stdout
                .replace(/IMAGE_BASE64:[A-Za-z0-9+/=\n]+/g, "[image omitted]")
                .replace(/CSV_EXPORT:[^\n]+\n[A-Za-z0-9+/=\n]+/g, "[csv omitted]")
                .replace(/TABLE_CSV:[^\n]+\n[\s\S]*/g, "[table csv omitted]");
              if (printable.trim()) console.log("\n─── STDOUT ──────────────────────────\n" + printable.trimEnd() + "\n────────────────────────────────────");
              if (stderr.trim()) console.log("\n─── STDERR ──────────────────────────\n" + stderr.trimEnd() + "\n────────────────────────────────────");
              if (rc !== 0) console.log("return_code:", rc);
              const imgMatch = stdout.match(/IMAGE_BASE64:([A-Za-z0-9+/=\n]+)/);
              if (imgMatch) {
                send({ type: "image", mediaType: "image/png", data: imgMatch[1].replace(/\n/g, "") });
              }
              const tableCsvMatch = stdout.match(/TABLE_CSV:([^\n]+)\n([\s\S]+)/);
              if (tableCsvMatch) {
                send({ type: "table_csv", filename: tableCsvMatch[1].trim(), csv: tableCsvMatch[2] });
              }
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
          const msg = err instanceof Error ? err.message : String(err);
          send({ type: "error", error: `Stream error: Error: ${msg}` });
        }
      }

      await processStream(stream);
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
