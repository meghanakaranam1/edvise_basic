import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type WebSource = { url: string; title: string }
export type WebResult = { summary: string; sources: WebSource[] }

export async function prefetchWeb(query: string): Promise<WebResult> {
  try {
    console.log('🌐 Web search for:', query)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (client.messages.create as any)({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      tools: [
        // Server-side web search tool — NO `description` field (causes 400).
        { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
      ],
      // Force the model to use the web search tool rather than answering from training data.
      tool_choice: { type: 'any' },
      messages: [{
        role: 'user',
        content: `Search the web for current, evidence-based information about: ${query}\n\nSummarize the key findings and best practices in 2-3 short paragraphs, drawing on the most relevant and reputable sources you find.`,
      }],
    })

    const sources: WebSource[] = []
    const seen = new Set<string>()
    let summary = ''

    for (const block of resp.content ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any

      // URLs from the raw search results
      if (b.type === 'web_search_tool_result') {
        const items = Array.isArray(b.content) ? b.content : [b.content].filter(Boolean)
        for (const item of items) {
          if (item?.type === 'web_search_result' && item.url && !seen.has(item.url)) {
            seen.add(item.url)
            sources.push({ url: item.url, title: item.title ?? item.url })
          }
        }
      }

      // The model's written summary + any URLs it cited inline
      if (b.type === 'text') {
        summary += b.text ?? ''
        for (const cit of b.citations ?? []) {
          if (cit?.type === 'web_search_result_location' && cit.url && !seen.has(cit.url)) {
            seen.add(cit.url)
            sources.push({ url: cit.url, title: cit.title ?? cit.url })
          }
        }
      }
    }

    console.log('✅ Web search done —', sources.length, 'sources,', summary.length, 'chars summary')
    return { summary: summary.trim(), sources: sources.slice(0, 4) }
  } catch (err) {
    console.error('❌ Web search error:', err instanceof Error ? err.message : err)
    return { summary: '', sources: [] }
  }
}
