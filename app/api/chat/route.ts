import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchKB } from "../../lib/kbSearch";
import { prefetchWeb } from "../../lib/webPrefetch";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type SimpleMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const { messages, fileId, pdfFiles, thresholdPrompt, columnMapping, kbScope }: {
    messages: SimpleMessage[];
    fileId?: string;
    pdfFiles?: { name: string; fileId: string }[];
    thresholdPrompt?: string;
    columnMapping?: Record<string, string>;
    kbScope?: string;
  } = await req.json();

  // Parse source scope tokens — KB/web run whenever their chips are active.
  const scopeTokens = (kbScope ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const kbScopes = scopeTokens.filter(s => s === 'student_success' || s === 'school');
  const useWeb = scopeTokens.includes('web');

  // Last user message text (used for KB keyword matching + web query)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';

  // Run KB search and web prefetch in parallel — driven purely by which chips
  // are enabled. Relevance scoring (score > 0, no fallback) keeps unrelated
  // questions from pulling docs, so no intent gating is needed.
  const [kbDocs, webResult] = await Promise.all([
    kbScopes.length ? searchKB(lastUserMsg, kbScopes, 4) : Promise.resolve([]),
    useWeb ? prefetchWeb(lastUserMsg) : Promise.resolve({ summary: '', sources: [] }),
  ]);
  const webSources = webResult.sources;
  console.log('🔍 KB scopes:', kbScopes, 'Web enabled:', useWeb);
  console.log('📚 KB docs:', kbDocs.length, 'Web sources:', webSources.length);
  if (webResult.summary) console.log('🌐 Web summary preview:', webResult.summary.slice(0, 200));

  let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const lastUserIdx = apiMessages.map((m) => m.role).lastIndexOf("user");

  if (fileId || kbDocs.length || pdfFiles?.length) {
    if (lastUserIdx >= 0) {
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

      contentBlocks.push({ type: "text", text: messages[lastUserIdx].content });

      apiMessages[lastUserIdx] = { role: "user", content: contentBlocks };
    }
  }

  const thresholdLine = thresholdPrompt
    ? `## Risk flag thresholds (use these consistently in EVERY code execution)\n${thresholdPrompt}\nRisk tiers: Critical = all present flags triggered, High = exactly 2, Moderate = exactly 1.\nAlways derive flags using the exact thresholds above — never recalculate with different criteria.`
    : '';

  const mappingLine = columnMapping && Object.keys(columnMapping).length
    ? `## Column mapping (use these human-readable labels when referring to columns — NEVER refer to a column by its raw name alone)\n` +
      Object.entries(columnMapping).map(([raw, label]) => `- \`${raw}\` → ${label}`).join('\n')
    : '';

  const system = fileId
    ? `You are Edvise, a teaching assistant. The teacher uploaded a gradebook CSV. Use code execution to answer every question with exact numbers from the data. Do not add numbered citations like [1] or [2] unless source documents are explicitly provided in this conversation.

${thresholdLine}${mappingLine ? '\n\n' + mappingLine : ''}

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
Never use /root/inputs/ — that path does not exist. The file is always under /files/input/. If multiple files are found, always use the most recently modified one — that is the file the teacher just uploaded.

## Rendering results as interactive cards

For the three standard analysis sections, output <!--CARD:--> markers INSTEAD of markdown tables or matplotlib charts. Each marker must be on its own line with the full JSON on a single line.

### Card 1 — School-wide risk overview
Compute: total students, any_flag (union — students with AT LEAST 1 flag), no_flag, each indicator count/pct, two_or_more (students with AT LEAST 2 flags — inclusive of all_three; compute as: students flagged on 2 or more indicators), all_three (students with ALL 3 flags), and 3 pairwise combos (students with EXACTLY 2 of that specific pair and NOT the third flag — these three counts sum to two_or_more minus all_three). Output on ONE line:
<!--CARD:{"type":"risk_overview","data":{"total":4651,"any_flag":{"count":1573,"pct":33.8},"no_flag":{"count":3078,"pct":66.2},"indicators":[{"name":"Academic Failure","count":1288,"pct":27.7,"color":"#c53030"},{"name":"Chronic Absence","count":477,"pct":10.3,"color":"#3E94A5"},{"name":"Suspensions","count":404,"pct":8.7,"color":"#B45309"}],"two_or_more":{"count":477,"pct":10.3},"all_three":{"count":119,"pct":2.6},"combinations":[{"label":"Absence + Academic","count":188,"pct":4.0},{"label":"Absence + Behavior","count":22,"pct":0.5},{"label":"Behavior + Academic","count":148,"pct":3.2}]}}-->

Replace ALL example values with actual computed numbers. Order indicators highest to lowest count. Pct to 1 decimal.

### Card 2 — Grade breakdown
Compute the same metrics as Card 1, per grade. Output on ONE line (include ALL grade levels):
<!--CARD:{"type":"grade_comparison","data":{"grades":[{"label":"Grade 6","n":2315,"any_flag":{"count":697,"pct":30.1},"no_flag":{"count":1618,"pct":69.9},"indicators":[{"name":"Academic Failure","count":552,"pct":23.8,"color":"#c53030"},{"name":"Chronic Absence","count":212,"pct":9.2,"color":"#3E94A5"},{"name":"Suspensions","count":166,"pct":7.2,"color":"#B45309"}],"two_or_more":{"count":155,"pct":6.7},"all_three":{"count":39,"pct":1.7},"combinations":[{"label":"Absence + Academic","count":88,"pct":3.8},{"label":"Absence + Behavior","count":9,"pct":0.4},{"label":"Behavior + Academic","count":58,"pct":2.5}]},{"label":"Grade 7","n":2336,...same structure...}]}}-->

### Card 3 — Subgroup analysis
Per group: any_flag_pct (% with any flag), each indicator count/pct, 3 pairwise combos (EXACTLY 2 of that specific pair — NOT the third flag), all_three. Use short combo labels: "Abs + Fail", "Sus + Fail", "Abs + Sus". Output on ONE line:
<!--CARD:{"type":"subgroup","data":{"total":4651,"categories":[{"tab":"Race/Ethnicity","equity_note":"One sentence equity finding","groups":[{"name":"White","n":1219,"any_flag_pct":17.3,"indicators":[{"name":"Academic Failure","count":124,"pct":10.2,"color":"#c53030"},{"name":"Chronic Absence","count":91,"pct":7.5,"color":"#3E94A5"},{"name":"Suspensions","count":55,"pct":4.5,"color":"#B45309"}],"combinations":[{"label":"Abs + Fail","count":20,"pct":1.6},{"label":"Sus + Fail","count":15,"pct":1.2},{"label":"Abs + Sus","count":6,"pct":0.5}],"all_three":{"count":9,"pct":0.7}},{"name":"Black","n":169,...},{"name":"Hispanic","n":2407,...}]},{"tab":"Gender","groups":[...]},{"tab":"SPED","groups":[...]},{"tab":"ELL","groups":[...]}]}}-->

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

Write one sentence announcing the export before running the code. After the code block completes, write at most one short sentence — do not re-summarize. Include ALL matching rows — never truncate or sample. Do NOT output base64, do NOT use <!--EXPORT:-->, do NOT embed data in any card or comment marker.

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

After **risk_overview** card: write 3–5 key takeaways interpreting what the numbers mean — dominant indicators, compounding risk, urgency. Close by inviting Stage 2.
<!--SUGGEST: Grade breakdown-->

After **grade_comparison** card: write 3–5 key takeaways on how risk differs across grades — which grade is most at-risk, which indicators shift most, what the trend signals. Close by inviting Stage 3.
<!--SUGGEST: Subgroup analysis-->

After **subgroup** card: write 3–5 key takeaways on equity patterns — highest-risk subgroups, disproportionality, intersections. Close by inviting Stage 4.
<!--SUGGEST: SEL overview-->

After **sel_overview** card: write 3–5 key takeaways on how at-risk students experience school differently through SEL. Close noting the analysis is complete.
<!--SUGGEST: Brainstorm interventions[kb] | Which students have all 3 risk flags? | What can I do for students who are chronically absent AND failing courses?-->

For all **other responses** (individual teacher questions, roster exports, follow-ups):
End with one <!--SUGGEST:--> line. First item is the most relevant next action; remaining 1–2 items are specific natural-language questions the teacher is likely to ask — not generic labels.

IMPORTANT: Whenever "Brainstorm interventions" appears in any SUGGEST line, it must be written as "Brainstorm interventions[kb]". Never add [kb] to any other suggestion.

## SEL / survey scale analysis
When the teacher asks about SEL, wellbeing, engagement, or connectedness, use the column mapping to identify SEL scale columns. Run Python to:
1. Compute school-wide mean per scale (school_avg), rounded to 2 decimal places
2. Define risk groups using the same thresholds as above: Chronically Absent (absence flag), Suspended (suspension flag), Failing Courses (academic failure flag), On Track (no flags at all)
3. For each group: mean per scale and average across all SEL scales (avg_score), both rounded to 2 decimal places
4. Detect the actual scale range: scale_min = min value across all SEL columns, scale_max = max value

Output on ONE line:
<!--CARD:{"type":"sel_overview","data":{"n_total":4651,"scale_min":1,"scale_max":5,"scales":["Academic Engagement","School Connectedness","Adult Support","Academic Pressure","Caring Adults"],"school_avg":{"Academic Engagement":3.7,"School Connectedness":3.8,"Adult Support":3.6,"Academic Pressure":3.9,"Caring Adults":3.6},"groups":[{"label":"Chronically Absent","n":349,"avg_score":3.5,"scores":{"Academic Engagement":3.4,"School Connectedness":3.6,"Adult Support":3.5,"Academic Pressure":3.6,"Caring Adults":3.4}},{"label":"Suspended","n":324,"avg_score":3.4,"scores":{"Academic Engagement":3.3,"School Connectedness":3.5,"Adult Support":3.4,"Academic Pressure":3.5,"Caring Adults":3.3}},{"label":"Failing Courses","n":1118,"avg_score":3.6,"scores":{"Academic Engagement":3.5,"School Connectedness":3.7,"Adult Support":3.5,"Academic Pressure":3.7,"Caring Adults":3.5}},{"label":"On Track","n":2816,"avg_score":3.9,"scores":{"Academic Engagement":3.9,"School Connectedness":4.0,"Adult Support":3.8,"Academic Pressure":4.1,"Caring Adults":3.8}}]}}-->

Replace ALL example values with actual computed numbers. Include every SEL scale in the scales array.

Always end every response with exactly one <!--SUGGEST:--> line following the pattern above. EXCEPTION: brainstorm intervention responses use a fixed SUGGEST line defined below — do not generate your own.

## Brainstorm interventions
When asked to brainstorm interventions (message starting with "Please brainstorm targeted" or any similar phrasing):
- Do NOT run code execution — use data already in the conversation context
- Format: **Bold title** followed by 2–3 sentences. No tables, no tier headers, no priority sequences
- Cite sources inline [1][2] etc.`
    : `You are Edvise, a helpful assistant for teachers. Answer questions conversationally and naturally. Do not volunteer research or interventions unless the teacher explicitly asks for them.`;

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
    ...(pdfFiles ?? []).map(f => ({ title: f.name.replace(/\.(pdf|txt|docx)$/i, ''), kind: 'pdf' as const })),
    ...kbDocs.map(d => ({ title: d.filename.replace(/_/g, ' ').replace(/\.(pdf|txt|docx)$/i, ''), kind: 'kb' as const })),
    ...webSources.map(s => ({ title: s.title, url: s.url, kind: 'web' as const })),
  ];

  const needsFilesApi = !!(fileId || kbDocs.length || pdfFiles?.length);

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: system + sourceBlock,
      messages: apiMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: fileId ? [{ type: "code_execution_20260120", name: "code_execution" } as any] : [],
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

      let codeBuffer = "";

      try {
        for await (const event of stream) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = event as any;

          // Log: start of a new code block
          if (e.type === "content_block_start" && e.content_block?.type === "tool_use") {
            codeBuffer = "";
          }

          // Log: accumulate code chunks
          if (e.type === "content_block_delta" && e.delta?.type === "input_json_delta") {
            codeBuffer += e.delta.partial_json ?? "";
          }

          // Log: code block complete — print the full code
          if (e.type === "content_block_stop" && codeBuffer) {
            try {
              const parsed = JSON.parse(codeBuffer);
              if (parsed.code) console.log("\n─── CODE ───────────────────────────\n" + parsed.code + "\n────────────────────────────────────");
            } catch {}
            codeBuffer = "";
          }

          // Capture execution results — log stdout/stderr, extract images
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

          // Stream text deltas
          if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
            send({ type: "text", data: e.delta.text });
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
