'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// Shown instead of the normal app when the teacher lands back here via a
// password-reset email link — Supabase attaches a temporary recovery
// session, and page.tsx listens for the PASSWORD_RECOVERY auth event to
// know to render this instead of the chat UI. See LoginPage's "Forgot
// password?" flow for where the email gets sent.
export default function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)',
    borderRadius: 10, fontFamily: 'inherit', fontSize: 14, color: 'var(--text)',
    background: 'var(--bg)', outline: 'none',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 22 }}>Ev</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>EdVise</h1>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '28px 28px 24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
            Set a new password
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20 }}>
            Choose a new password for your account.
          </p>

          {error && (
            <div style={{ marginBottom: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>New Password</label>
              <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" autoFocus />
            </div>
            <div>
              <label style={lbl}>Confirm Password</label>
              <input style={inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} placeholder="••••••••" />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: '11px 0', background: loading ? '#c5d4d8' : 'var(--primary)',
                color: 'white', border: 'none', borderRadius: 10, fontFamily: 'inherit',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <span style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              ) : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
