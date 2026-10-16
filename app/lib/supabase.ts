import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

// A password-recovery link lands with a #access_token=...&type=recovery
// hash, which supabase-js parses and fires PASSWORD_RECOVERY for almost
// immediately on client construction (detectSessionInUrl defaults to true)
// — fast enough that page.tsx's own onAuthStateChange listener, which only
// gets registered inside a useEffect (strictly after mount), can miss the
// event entirely. The session itself still lands fine via getSession()
// moments later, so the symptom was the recovery link silently logging the
// teacher straight into the normal app instead of the "set new password"
// screen. Subscribing here, synchronously at module load (before any
// React effect can run), guarantees this listener is in place before that
// event has any chance to fire.
export let pendingPasswordRecovery = false
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') pendingPasswordRecovery = true
})

export type SupabaseSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
