import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { emailConfirmRedirectUrl, isEmailConfirmed, passwordResetRedirectUrl } from '../lib/authState'
import { fetchUserProfileState, isOnboardingCompleted } from '../lib/profile'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  bootstrapping: boolean
  emailConfirmed: boolean
  onboardingCompleted: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string) => Promise<{
    error: AuthError | null
    needsEmailConfirmation: boolean
  }>
  signOut: () => Promise<void>
  resendSignupConfirmation: (email: string) => Promise<{ error: AuthError | null }>
  requestPasswordReset: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)

  const user = session?.user ?? null
  const emailConfirmed = isEmailConfirmed(user)

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)

    try {
      const profile = await fetchUserProfileState(userId)
      setOnboardingCompleted(isOnboardingCompleted(profile))
    } catch (error) {
      console.error('Profil konnte nicht geladen werden:', error)
      setOnboardingCompleted(false)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) {
      setOnboardingCompleted(false)
      return
    }

    await loadProfile(session.user.id)
  }, [loadProfile, session?.user.id])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (error) {
        console.error('Session konnte nicht geladen werden:', error.message)
      }

      setSession(data.session)
      setAuthLoading(false)

      if (data.session?.user.id) {
        await loadProfile(data.session.user.id)
      } else {
        setOnboardingCompleted(false)
        setProfileLoading(false)
      }
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)

      if (nextSession?.user.id) {
        void loadProfile(nextSession.user.id)
      } else {
        setOnboardingCompleted(false)
        setProfileLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const bootstrapping = authLoading || (session !== null && profileLoading)

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      bootstrapping,
      emailConfirmed,
      onboardingCompleted,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error }
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: emailConfirmRedirectUrl(),
          },
        })

        return {
          error,
          needsEmailConfirmation: !error && !data.session,
        }
      },
      async signOut() {
        await supabase.auth.signOut()
      },
      async resendSignupConfirmation(email) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: {
            emailRedirectTo: emailConfirmRedirectUrl(),
          },
        })

        return { error }
      },
      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: passwordResetRedirectUrl(),
        })

        return { error }
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        return { error }
      },
      refreshProfile,
    }),
    [session, user, bootstrapping, emailConfirmed, onboardingCompleted, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
