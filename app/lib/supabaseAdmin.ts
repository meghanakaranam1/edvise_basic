import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// Lazy singleton. Every server route that needs service-role access used to
// construct its own client at module scope — which runs at import time,
// including during Next's build-time "collect page data" step. If
// SUPABASE_SERVICE_KEY isn't set in that build environment, createClient
// throws right there and fails the ENTIRE production build, not just
// requests to that one route — which is exactly what happened when this key
// was missing from Vercel's Production environment. Deferring construction
// to first actual call confines a missing-key failure to the one request
// that needs it, instead of taking down every route in the deploy.
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
  }
  return client
}
