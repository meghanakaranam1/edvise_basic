'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email,
            name,
            school_name: schoolName,
            role: 'teacher',
          })
        }
        setSuccess('Account created! Check your email to confirm, then sign in.')
        setMode('login')
      }
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
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 22 }}>Ev</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>EdVise</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Student Success Assistant</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '28px 28px 24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', textAlign: 'center', marginBottom: 20 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>

          {error && (
            <div style={{ marginBottom: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ marginBottom: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#15803d' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <>
                <div>
                  <label style={lbl}>Full Name</label>
                  <input style={inp} type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Ms. Johnson" />
                </div>
                <div>
                  <label style={lbl}>School Name</label>
                  <input style={inp} type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)} required placeholder="Lincoln Middle School" />
                </div>
              </>
            )}
            <div>
              <label style={lbl}>Email</label>
              <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="teacher@school.edu" />
            </div>
            <div>
              <label style={lbl}>Password</label>
              <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
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
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 18 }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null) }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20, opacity: 0.6 }}>
          Powered by Anthropic Claude · Built for K–12 educators
        </p>
      </div>
    </div>
  )
}
