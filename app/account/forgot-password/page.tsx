'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import StoreHeader from '@/components/store-header'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/account/reset-password')}`
      const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
      if (resetError) throw resetError
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the password reset email.')
    } finally { setBusy(false) }
  }

  return <><StoreHeader/><main className="store-page account-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/account">My account</Link><span>/</span> Reset password</div><section className="account-auth account-password-panel">
    <span className="section-kicker">ORO account security</span>
    <h1>{sent ? 'Check your inbox.' : 'Forgot your password?'}</h1>
    {sent ? <><p> If an account exists for {email}, Supabase will send a secure password reset link. Check your inbox and spam folder.</p><Link className="button-dark full-width" href="/account">Back to sign in</Link></> : <form className="account-form" onSubmit={submit}>
      <p>Enter the email address linked to your ORO account. We'll send you a secure link to choose a new password.</p>
      {error && <p className="account-alert account-error" role="alert">{error}</p>}
      <label className="form-field">Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <button className="button-dark full-width" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      <Link className="account-forgot-link" href="/account">Back to sign in</Link>
    </form>}
  </section></main></>
}
