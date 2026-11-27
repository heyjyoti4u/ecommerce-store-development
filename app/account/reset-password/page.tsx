'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import StoreHeader from '@/components/store-header'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSupabaseBrowserClient().auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message)
      else if (!data.session) setError('This password reset link is invalid or has expired. Request a new one.')
      setReady(true)
    }).catch((cause) => { setError(cause instanceof Error ? cause.message : 'Could not verify reset link.'); setReady(true) })
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true)
    try {
      const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password })
      if (updateError) throw updateError
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your password.')
    } finally { setBusy(false) }
  }

  return <><StoreHeader/><main className="store-page account-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/account">My account</Link><span>/</span> New password</div><section className="account-auth account-password-panel">
    <span className="section-kicker">ORO account security</span>
    <h1>{saved ? 'Password updated.' : 'Choose a new password.'}</h1>
    {!ready ? <p>Checking your secure reset link…</p> : saved ? <><p>Your password has been changed. You can now sign in with your new password.</p><Link className="button-dark full-width" href="/account">Return to sign in</Link></> : error && !password ? <><p className="account-alert account-error" role="alert">{error}</p><Link className="button-dark full-width" href="/account/forgot-password">Request another reset link</Link></> : <form className="account-form" onSubmit={submit}>
      <p>Choose a new password for your ORO account.</p>
      {error && <p className="account-alert account-error" role="alert">{error}</p>}
      <label className="form-field">New password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
      <label className="form-field">Confirm new password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></label>
      <button className="button-dark full-width" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
    </form>}
  </section></main></>
}
