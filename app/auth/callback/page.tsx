'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function finishVerification() {
      try {
        const supabase = getSupabaseBrowserClient()
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const tokenHash = params.get('token_hash')
        const type = params.get('type')
        const authError = params.get('error_description') || params.get('error')

        if (authError) throw new Error(decodeURIComponent(authError.replace(/\+/g, ' ')))
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else if (tokenHash && (type === 'signup' || type === 'email' || type === 'recovery')) {
          const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type === 'recovery' ? 'recovery' : type === 'signup' ? 'signup' : 'email' })
          if (verifyError) throw verifyError
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Email verification could not be completed. Please open the newest confirmation email or request another link.')
        const requestedNext = params.get('next')
        const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/account?verified=1'
        router.replace(safeNext)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not verify your email.')
      }
    }
    void finishVerification()
    return () => { active = false }
  }, [router])

  return <main className="store-page account-page">
    <section className="account-auth account-verification">
      {error ? <>
        <span className="section-kicker">Verification issue</span>
        <h1>We couldn't verify your email.</h1>
        <p role="alert">{error}</p>
        <a className="button-dark full-width" href="/account">Return to your account</a>
      </> : <>
        <span className="section-kicker">ORO account</span>
        <h1>Verifying your email…</h1>
        <p>Please wait while we securely activate your account.</p>
      </>}
    </section>
  </main>
}
