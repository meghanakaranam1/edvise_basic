'use client'
import { useEffect, useState } from 'react'
import type { SupabaseSession } from '../../lib/supabase'
import { listContextRules, addContextRule, updateContextRule, deleteContextRule, type ContextRule } from '../../lib/db'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SchoolContextSettings({ session, onRulesChanged }: { session: SupabaseSession; onRulesChanged?: (rules: ContextRule[]) => void }) {
  const [rules, setRules] = useState<ContextRule[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editText, setEditText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    listContextRules(userId).then(r => { setRules(r); setLoading(false) })
  }, [userId])

  async function handleAdd() {
    const text = newText.trim()
    if (!text || !userId) return
    setAdding(true)
    try {
      const rule = await addContextRule(userId, text, newName.trim() || undefined)
      const next = [rule, ...rules]
      setRules(next)
      setNewName('')
      setNewText('')
      onRulesChanged?.(next)
    } catch (err) {
      console.error('Failed to add context rule:', err)
    } finally {
      setAdding(false)
    }
  }

  function startEdit(rule: ContextRule) {
    setEditingId(rule.id)
    setEditName(rule.name ?? '')
    setEditText(rule.text)
  }

  async function saveEdit(id: string) {
    const text = editText.trim()
    if (!text) return
    setBusyId(id)
    try {
      const name = editName.trim() || null
      await updateContextRule(id, { text, name })
      const next = rules.map(r => r.id === id ? { ...r, text, name, updated_at: new Date().toISOString() } : r)
      setRules(next)
      setEditingId(null)
      onRulesChanged?.(next)
    } catch (err) {
      console.error('Failed to update context rule:', err)
    } finally {
      setBusyId(null)
    }
  }

  async function toggleEnabled(rule: ContextRule) {
    setBusyId(rule.id)
    try {
      const enabled = !rule.enabled
      await updateContextRule(rule.id, { enabled })
      const next = rules.map(r => r.id === rule.id ? { ...r, enabled, updated_at: new Date().toISOString() } : r)
      setRules(next)
      onRulesChanged?.(next)
    } catch (err) {
      console.error('Failed to toggle context rule:', err)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remove this rule?')) return
    setBusyId(id)
    try {
      await deleteContextRule(id)
      const next = rules.filter(r => r.id !== id)
      setRules(next)
      onRulesChanged?.(next)
    } catch (err) {
      console.error('Failed to delete context rule:', err)
    } finally {
      setBusyId(null)
    }
  }

  const btnBase: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 5,
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>School context</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Every rule marked on is automatically included in every analysis and conversation — school demographics,
        programs already in place, or how you'd like data processed — so you don't have to repeat it each session.
        Turn a rule off to stop it from applying without deleting it.
      </p>

      {/* Add new rule */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={'Name (optional) — e.g. "Free/reduced lunch %"'}
          style={{
            padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8,
            fontFamily: 'inherit', fontSize: 12.5, color: 'var(--text)', background: 'var(--bg)', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder={'e.g. "About 80% of our students are on free/reduced lunch."'}
            style={{
              flex: 1, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8,
              fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', background: 'var(--bg)', outline: 'none',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--primary, #2A3B7C)',
              color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adding || !newText.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {adding ? 'Adding…' : 'Add rule'}
          </button>
        </div>
      </div>

      {/* Rules list */}
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      ) : rules.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>No rules yet — add one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(rule => {
            const edited = rule.updated_at && rule.updated_at !== rule.created_at
            const isEditing = editingId === rule.id
            const isBusy = busyId === rule.id
            return (
              <div
                key={rule.id}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
                  background: 'var(--surface, #fff)', opacity: rule.enabled ? 1 : 0.5,
                }}
              >
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{
                        width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 8,
                        fontFamily: 'inherit', fontSize: 12.5, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', marginBottom: 6,
                      }}
                    />
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 8,
                        fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingId(null)} style={{ ...btnBase, color: 'var(--text-muted)' }}>Cancel</button>
                      <button onClick={() => saveEdit(rule.id)} disabled={isBusy || !editText.trim()} style={{ ...btnBase, color: '#3E94A5' }}>
                        {isBusy ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {rule.name && (
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--primary, #2A3B7C)', marginBottom: 2 }}>{rule.name}</div>
                        )}
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{rule.text}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleEnabled(rule)}
                        disabled={isBusy}
                        title={rule.enabled ? 'On — applies to every conversation' : 'Off — will not be applied'}
                        style={{
                          width: 34, height: 19, borderRadius: 10, border: 'none',
                          background: rule.enabled ? '#3E94A5' : '#d0d5e8',
                          cursor: isBusy ? 'default' : 'pointer', position: 'relative', flexShrink: 0, marginTop: 2,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, left: rule.enabled ? 17 : 2,
                          width: 15, height: 15, borderRadius: '50%', background: 'white', transition: 'left 0.15s',
                        }} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {rule.enabled ? 'On' : 'Off'} · Added {formatDate(rule.created_at)}{edited ? ` · edited ${formatDate(rule.updated_at)}` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => startEdit(rule)} style={{ ...btnBase, color: '#2A3B7C' }}>Edit</button>
                        <button onClick={() => handleDelete(rule.id)} disabled={isBusy} style={{ ...btnBase, color: '#c53030' }}>
                          {isBusy ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
