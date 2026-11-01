import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Stethoscope, Mail, Lock, Eye, EyeOff, UserPlus, LogIn, Hospital, Loader2, User } from 'lucide-react'

export default function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'signup'

  // Login-mode fields (no email — resolved via lookup_portal_email RPC)
  const [name, setName] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [mrn, setMrn] = useState('')
  const [password, setPassword] = useState('')

  // Signup-mode extra field (auth still needs an email)
  const [email, setEmail] = useState('')

  // Hospitals list for the dropdown
  const [hospitals, setHospitals] = useState([])

  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Load the hospitals list once on mount — needed for the hospital dropdown.
  // We use the `list_portal_hospitals()` SECURITY DEFINER RPC instead of
  // querying the `hospitals` table directly because the table is locked
  // down by RLS policies that require an authenticated user. On the Login
  // page, the patient is NOT yet authenticated, so a direct table query
  // returns 0 rows and the dropdown renders empty. The RPC runs with the
  // function owner's privileges and bypasses RLS, exposing only the columns
  // needed for the public dropdown (id, name, logo_url).
  useEffect(() => {
    let mounted = true
    supabase
      .rpc('list_portal_hospitals')
      .then(({ data, error }) => {
        if (mounted && data) setHospitals(data)
        if (error) console.warn('list_portal_hospitals RPC error:', error.message)
      })
    return () => { mounted = false }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (!name.trim() || !hospitalId || !mrn.trim()) {
      setError('Please fill in your name, hospital, and hospital number.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        // LOGIN — patient types name + hospital + MRN + password.
        // The AuthContext.login() resolves the auth email via the
        // lookup_portal_email RPC, then signs in.
        const { error: loginError } = await login({
          name: name.trim(),
          hospitalId,
          mrn: mrn.trim(),
          password,
        })
        if (loginError) {
          setError(loginError.message || 'Login failed. Check your details and try again.')
        } else {
          navigate('/')
        }
      } else {
        // SIGNUP — patient self-registers using name + hospital + MRN + email + password
        if (!email.trim()) {
          setError('Please enter your email address.')
          setLoading(false)
          return
        }
        const { error: signupError } = await signup({
          name: name.trim(),
          hospitalId,
          mrn: mrn.trim(),
          email: email.trim(),
          password,
        })
        if (signupError) {
          setError(signupError.message || 'Could not create account.')
        } else {
          // Check if email confirmation is required
          const { data: session } = await supabase.auth.getSession()
          if (session?.session) {
            navigate('/')
          } else {
            setSuccess('Account created! Please check your email to confirm your account, then log in.')
            setMode('login')
            setEmail('')
            setPassword('')
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setSuccess('')
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
            ? 'Sign in with your hospital number'
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
          {/* Full Name — required in both modes */}
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Full Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Exactly as registered at the hospital"
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all-smooth"
                required
                autoFocus
              />
            </div>
            <p className="text-[11px] text-surface-400 mt-1.5">
              Must match the name on your hospital record.
            </p>
          </div>

          {/* Hospital dropdown — required in both modes */}
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Hospital</label>
            <div className="relative">
              <Hospital size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <select
                value={hospitalId}
                onChange={e => setHospitalId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all-smooth appearance-none"
                required
              >
                <option value="">Select your hospital</option>
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Hospital Number (MRN) — required in both modes */}
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
              />
            </div>
            <p className="text-[11px] text-surface-400 mt-1.5">
              This is the number on your hospital registration card or folder.
            </p>
          </div>

          {/* Email — only required for signup (login resolves it via RPC) */}
          {mode === 'signup' && (
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
                />
              </div>
              <p className="text-[11px] text-surface-400 mt-1.5">
                Used to create your login account. You won't need to type it again.
              </p>
            </div>
          )}

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
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
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
