import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Stethoscope, Mail, Lock, Eye, EyeOff, UserPlus, LogIn, Hospital, Loader2 } from 'lucide-react'

export default function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mrn, setMrn] = useState('') // hospital number for signup
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError('Please enter your email and password.')
        return
      }
      setLoading(true)
      try {
        const { error } = await login(email.trim(), password)
        if (error) {
          setError(error.message || 'Login failed. Check your email and password.')
        } else {
          navigate('/')
        }
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    } else {
      // SIGNUP — patient self-registers using MRN + email + password
      if (!email.trim() || !password || !mrn.trim()) {
        setError('Please fill in all fields including your hospital number.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      setLoading(true)
      try {
        // Step 1: Look up the patient by hospital number (MRN)
        const { data: patientData, error: lookupError } = await supabase
          .from('patients')
          .select('id, hospital_id, full_name, email, phone')
          .or(`patient_id.eq.${mrn.trim()},hospital_number.eq.${mrn.trim()}`)
          .maybeSingle()

        if (lookupError || !patientData) {
          setError('Hospital number not found. Please check your number or ask your hospital to register you.')
          setLoading(false)
          return
        }

        // Step 2: Check if a portal account already exists for this patient
        const { data: existingUser } = await supabase
          .from('patient_users')
          .select('id')
          .eq('patient_id', patientData.id)
          .maybeSingle()

        if (existingUser) {
          setError('An account already exists for this hospital number. Please log in instead.')
          setMode('login')
          setLoading(false)
          return
        }

        // Step 3: Create the Supabase auth account
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        })

        if (authError) {
          setError(authError.message || 'Could not create account.')
          setLoading(false)
          return
        }

        // Step 4: Link the auth account to the patient record
        if (authData.user) {
          const { error: linkError } = await supabase
            .from('patient_users')
            .insert({
              user_id: authData.user.id,
              patient_id: patientData.id,
              hospital_id: patientData.hospital_id,
              is_relative: false,
              is_active: true,
            })

          if (linkError) {
            console.error('Failed to link patient_users:', linkError)
            // The auth account was created but the link failed — patient can still log in
            // but the portal won't find their patient record. They should contact the hospital.
          }
        }

        // Step 5: Check if email confirmation is required
        if (authData.session) {
          // Auto-logged in (email confirmation disabled)
          navigate('/')
        } else {
          // Email confirmation required
          setSuccess('Account created! Please check your email to confirm your account, then log in.')
          setMode('login')
          setMrn('')
          setPassword('')
        }
      } catch (err) {
        setError(err.message || 'Something went wrong during signup.')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-500 flex items-center justify-center mb-4 shadow-lg shadow-primary-200">
          <Stethoscope size={32} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-surface-900">GOODIE-MEDHUB</h1>
        <p className="text-sm text-surface-500 mt-1">Patient Portal</p>
      </div>

      {/* Form card */}
      <div className="w-full max-w-sm bg-white rounded-2xl card-shadow-lg p-6">
        <h2 className="text-lg font-bold text-surface-900 mb-1">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-sm text-surface-500 mb-5">
          {mode === 'login'
            ? 'Sign in to access your health records'
            : 'Sign up using your hospital number'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-accent-50 border border-accent-100 text-sm text-accent-700">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* MRN field (only for signup) */}
          {mode === 'signup' && (
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Hospital Number (MRN)</label>
              <div className="relative">
                <Hospital size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={mrn}
                  onChange={e => setMrn(e.target.value)}
                  placeholder="e.g. GMH/2026/0001"
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all-smooth"
                  required
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-surface-400 mt-1.5">
                This is the number on your hospital registration card or folder.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all-smooth"
                autoComplete="email"
                required
                autoFocus={mode === 'login'}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all-smooth"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="text-[11px] text-surface-400 mt-1.5">Minimum 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all-smooth disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === 'login' ? (
              <>
                <LogIn size={18} /> Sign In
              </>
            ) : (
              <>
                <UserPlus size={18} /> Create Account
              </>
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="mt-5 text-center">
          <button
            onClick={() => {
              setMode(m => m === 'login' ? 'signup' : 'login')
              setError('')
              setSuccess('')
            }}
            className="text-sm text-primary-500 hover:text-primary-600 font-medium"
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>

        {mode === 'signup' && (
          <div className="mt-3 p-3 rounded-lg bg-primary-50 text-center">
            <p className="text-[11px] text-primary-600">
              Ask your hospital staff to register you first, then use your hospital number to create your portal account.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-surface-400 mt-6 text-center max-w-xs">
        By continuing, you agree to the terms of service and privacy policy of your healthcare provider.
      </p>
    </div>
  )
}
