import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type WebSource = { url: string; title: string }

export async function prefetchWeb(query: string): Promise<WebSource[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (client.messages.create as any)({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305' }],
      messages: [{ role: 'user', content: `Search for research and best practices on: ${query}` }],
    })

    const sources: WebSource[] = []
    const seen = new Set<string>()

    for (const block of resp.content ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any
      if (b.type === 'web_search_tool_result') {
        const items = Array.isArray(b.content) ? b.content : [b.content].filter(Boolean)
        for (const item of items) {
          if (item?.type === 'web_search_result' && item.url && !seen.has(item.url)) {
            seen.add(item.url)
            sources.push({ url: item.url, title: item.title ?? item.url })
          }
        }
      }
      if (b.type === 'text') {
        for (const cit of b.citations ?? []) {
          if (cit?.type === 'web_search_result_location' && cit.url && !seen.has(cit.url)) {
            seen.add(cit.url)
            sources.push({ url: cit.url, title: cit.title ?? cit.url })
          }
        }
      }
    }
    return sources.slice(0, 3)
  } catch {
    return []
  }
}
