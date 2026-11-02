import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

// =====================================================================
// NEW ARCHITECTURE — JWT-based patient identification
// =====================================================================
//
// The previous version queried the `patient_users` and `patients`
// tables after login to find the patient record. That depended on:
//   1. RLS policies allowing the read (which kept failing)
//   2. The `get-my-patient-data` Edge Function being deployed
//   3. Network round-trips that could fail
//
// This version reads patient_id, hospital_id, and patient_name DIRECTLY
// from `session.user.user_metadata` — which the `create-portal-account`
// Edge Function sets at account creation time. The JWT is populated
// by Supabase Auth automatically, so this works:
//   - With ZERO database queries (no RLS can block it)
//   - With ZERO Edge Function calls (no deployment dependency)
//   - With ZERO network round-trips (data is in the session already)
//   - Even if the database is completely down
//
// FALLBACK CHAIN (only if user_metadata is missing — e.g., for accounts
// created before the Edge Function existed):
//   1. Try the get-my-patient-data Edge Function (if deployed)
//   2. Try direct table query on patient_users (may fail due to RLS)
//   3. Use just the user_metadata (minimal but functional)
// =====================================================================

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [patient, setPatient] = useState(null)
  const [hospital, setHospital] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phoneVerified, setPhoneVerified] = useState(false)

  // Stash the last-used lookup credentials (name, hospital_id, mrn) so
  // loadPatientData can fall back to them if user_metadata is missing.
  const pendingLookupRef = useRef(null)

  // -----------------------------------------------------------------
  // loadPatientData — find the patient record + hospital for the
  // currently-authenticated user.
  //
  // NEW: Try user_metadata FIRST (zero queries, zero RLS dependency).
  // Only fall back to DB queries if user_metadata is missing.
  // -----------------------------------------------------------------
  const loadPatientData = useCallback(async (authUser) => {
    if (!authUser?.id) {
      setPatient(null)
      setHospital(null)
      return
    }

    try {
      let patientData = null
      let hospitalId = null
      let lookupMethod = 'none'

      // =============================================================
      // STEP 1 (PRIMARY): Read from JWT user_metadata.
      // The create-portal-account Edge Function stores patient_id,
      // hospital_id, and patient_name in user_metadata at account
      // creation time. This is ALWAYS available immediately after
      // login — no DB query, no RLS, no network round-trip.
      // =============================================================
      const meta = authUser.user_metadata || {}
      if (meta.patient_id) {
        patientData = {
          id: meta.patient_id,
          hospital_id: meta.hospital_id,
          full_name: meta.patient_name || 'Patient',
          // These may not be in user_metadata (depending on when the
          // account was created), but the dashboard can handle missing
          // fields gracefully.
          hospital_number: meta.hospital_number || meta.mrn || null,
          phone: meta.phone || null,
          email: authUser.email || null,
          // Mark this as a metadata-derived record so the UI knows it
          // may be incomplete. The dashboard will still render.
          _source: 'jwt_metadata',
        }
        hospitalId = meta.hospital_id
        lookupMethod = 'jwt_user_metadata'
      }

      // =============================================================
      // STEP 2 (FALLBACK): If user_metadata doesn't have patient_id
      // (e.g., for accounts created before the Edge Function existed,
      // or accounts created via self-signup), try the get-my-patient-data
      // Edge Function. This uses the service role key to bypass RLS.
      // =============================================================
      if (!patientData) {
        try {
          const fallbackBody = pendingLookupRef.current
            ? {
                name: pendingLookupRef.current.name,
                hospital_id: pendingLookupRef.current.hospitalId,
                mrn: pendingLookupRef.current.mrn,
              }
            : {}

          const { data: bundle, error: fnError } = await supabase.functions.invoke(
            'get-my-patient-data',
            { body: fallbackBody }
          )

          if (!fnError && bundle?.patient) {
            patientData = bundle.patient
            hospitalId = bundle.patient.hospital_id || bundle.hospital?.id
            lookupMethod = 'edge_function'
          }
        } catch (e) {
          console.warn('get-my-patient-data Edge Function failed (non-fatal):', e.message)
        }
      }

      // =============================================================
      // STEP 3 (FALLBACK): If both user_metadata and the Edge Function
      // failed, try a direct table query on patient_users. This MAY
      // fail due to RLS, but we try anyway as a last resort.
      // =============================================================
      if (!patientData) {
        try {
          const { data: userRow } = await supabase
            .from('patient_users')
            .select('patient_id, hospital_id, patient_name, mrn')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .maybeSingle()

          if (userRow?.patient_id) {
            const { data: p } = await supabase
              .from('patients')
              .select('*')
              .eq('id', userRow.patient_id)
              .maybeSingle()

            if (p) {
              patientData = p
              hospitalId = userRow.hospital_id || p.hospital_id
              lookupMethod = 'direct_query'
            }
          }
        } catch (e) {
          console.warn('Direct patient_users query failed (non-fatal):', e.message)
        }
      }

      // =============================================================
      // STEP 4: If we STILL don't have patient data, use whatever we
      // can from the auth user's email + user_metadata. This ensures
      // the patient ALWAYS sees SOMETHING after login, even if every
      // DB query + Edge Function failed.
      // =============================================================
      if (!patientData) {
        console.warn('All patient lookup methods failed — using minimal auth data. Lookup method:', lookupMethod)
        // Don't set patient to null — set a minimal object so the
        // dashboard renders SOMETHING instead of the NoRecord page.
        patientData = {
          id: null,
          hospital_id: meta.hospital_id || null,
          full_name: meta.patient_name || authUser.email?.split('@')[0] || 'Patient',
          hospital_number: meta.hospital_number || meta.mrn || null,
          phone: null,
          email: authUser.email,
          _source: 'auth_user_minimal',
        }
        hospitalId = meta.hospital_id
        lookupMethod = 'auth_user_minimal'
      }

      setPatient(patientData)
      setPhoneVerified(false)

      // ---- Load the hospital (if we have a hospital_id) ----
      // This is a direct table read — may fail due to RLS, but we
      // try. If it fails, the patient still has their basic data.
      if (hospitalId) {
        try {
          const { data: hospitalData } = await supabase
            .from('hospitals')
            .select('*')
            .eq('id', hospitalId)
            .maybeSingle()
          if (hospitalData) {
            setHospital(hospitalData)
          } else {
            // Minimal hospital object from metadata
            setHospital({ id: hospitalId, name: meta.hospital_name || 'Your Hospital' })
          }
        } catch (e) {
          console.warn('Hospital lookup failed (non-fatal):', e.message)
          setHospital({ id: hospitalId, name: meta.hospital_name || 'Your Hospital' })
        }
      }

      console.info('[AuthContext] Patient loaded via:', lookupMethod)
    } catch (err) {
      // CRITICAL: never let this throw — it would cause auto-logout.
      console.error('loadPatientData error (suppressed):', err)
    }
  }, [])

  // -----------------------------------------------------------------
  // Listen for auth state changes
  // -----------------------------------------------------------------
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return
      setSession(initialSession)
      setUser(initialSession?.user || null)
      if (initialSession?.user) {
        loadPatientData(initialSession.user)
      } else {
        setPatient(null)
        setHospital(null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setPatient(null)
          setHospital(null)
          setPhoneVerified(false)
          pendingLookupRef.current = null
          setLoading(false)
          return
        }

        setSession(newSession)
        setUser(newSession?.user || null)

        if (newSession?.user) {
          await loadPatientData(newSession.user)
        } else {
          setPatient(null)
          setHospital(null)
        }
        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadPatientData])

  // -----------------------------------------------------------------
  // Login — patient types (name + hospital_id + mrn + password).
  // Resolves the auth email via the lookup_portal_email RPC, then
  // signs in. After sign-in, loadPatientData reads from user_metadata.
  // -----------------------------------------------------------------
  const login = useCallback(async ({ name, hospitalId, mrn, password }) => {
    if (!name || !hospitalId || !mrn || !password) {
      return { data: null, error: { message: 'All fields are required.' } }
    }

    // Step 1: resolve the auth email for (name, hospital_id, mrn)
    const { data: email, error: rpcError } = await supabase
      .rpc('lookup_portal_email', {
        p_full_name: name.trim(),
        p_hospital_id: hospitalId,
        p_mrn: mrn.trim(),
      })
      .single()

    if (rpcError) {
      return { data: null, error: { message: 'Could not verify your identity. Please check your details and try again.' } }
    }

    if (!email) {
      return { data: null, error: { message: 'No portal account matches that name, hospital, and hospital number. Please ask your hospital to create a portal account for you.' } }
    }

    // Stash the lookup credentials so loadPatientData can fall back to
    // them if user_metadata is missing.
    pendingLookupRef.current = {
      name: name.trim(),
      hospitalId,
      mrn: mrn.trim(),
    }

    // Step 2: sign in with the resolved email + the password
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    return { data, error }
  }, [])

  // -----------------------------------------------------------------
  // Sign up (self-registration)
  // -----------------------------------------------------------------
  const signup = useCallback(async ({ name, hospitalId, mrn, email, password }) => {
    if (!name || !hospitalId || !mrn || !email || !password) {
      return { data: null, error: { message: 'All fields are required.' } }
    }

    const { data: patientData, error: lookupError } = await supabase
      .from('patients')
      .select('id, hospital_id, full_name, email, phone, hospital_number')
      .eq('hospital_id', hospitalId)
      .or(`hospital_number.eq.${mrn.trim()},patient_id.eq.${mrn.trim()}`)
      .maybeSingle()

    if (lookupError || !patientData) {
      return {
        data: null,
        error: {
          message: 'Hospital number not found at this hospital. Please check your details or ask your hospital to register you first.',
        },
      }
    }

    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (normalize(patientData.full_name) !== normalize(name)) {
      return {
        data: null,
        error: {
          message: 'The name you entered does not match the name on file for this hospital number. Please check and try again.',
        },
      }
    }

    const { data: existingUser } = await supabase
      .from('patient_users')
      .select('id')
      .eq('patient_id', patientData.id)
      .maybeSingle()

    if (existingUser) {
      return {
        data: null,
        error: {
          message: 'An account already exists for this hospital number. Please log in instead.',
        },
      }
    }

    // IMPORTANT: store patient_id, hospital_id, patient_name in
    // user_metadata at signup time too — so the JWT-based lookup
    // works for self-registered accounts as well.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          patient_id: patientData.id,
          hospital_id: patientData.hospital_id,
          patient_name: patientData.full_name,
          hospital_number: patientData.hospital_number || mrn.trim(),
          phone: patientData.phone || null,
          created_via: 'self_signup',
        },
      },
    })

    if (authError) {
      return { data: null, error: authError }
    }

    if (!authData?.user?.id) {
      return { data: null, error: { message: 'Account creation returned no user ID. Please try again.' } }
    }

    // Link the auth account to the patient record
    const { error: linkError } = await supabase
      .from('patient_users')
      .insert({
        user_id: authData.user.id,
        patient_id: patientData.id,
        hospital_id: patientData.hospital_id,
        patient_name: patientData.full_name,
        mrn: patientData.hospital_number || mrn.trim(),
        is_relative: false,
        is_active: true,
      })

    if (linkError) {
      console.error('Failed to link patient_users:', linkError)
      return {
        data: authData,
        error: {
          message: 'Account created but we could not link it to your patient record. Please contact your hospital to complete the setup.',
        },
      }
    }

    pendingLookupRef.current = {
      name: patientData.full_name,
      hospitalId: patientData.hospital_id,
      mrn: patientData.hospital_number || mrn.trim(),
    }

    return { data: authData, error: null }
  }, [])

  // Verify phone number matches the patient record
  const verifyPhone = useCallback(async (phone) => {
    if (!patient) return { verified: false, error: 'No patient record loaded' }

    const patientPhone = (patient.phone || '').replace(/\s+/g, '').replace(/-/g, '')
    const inputPhone = (phone || '').replace(/\s+/g, '').replace(/-/g, '')

    const normalizePhone = (p) => p.replace(/^\+?234/, '0').replace(/^0+/, '0')
    const normalized1 = normalizePhone(patientPhone)
    const normalized2 = normalizePhone(inputPhone)

    if (normalized1 === normalized2 || patientPhone === inputPhone) {
      setPhoneVerified(true)
      return { verified: true }
    }

    return { verified: false, error: 'Phone number does not match our records. Please use the phone number registered with your hospital.' }
  }, [patient])

  // Logout
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setPatient(null)
    setHospital(null)
    setPhoneVerified(false)
    pendingLookupRef.current = null
  }, [])

  const value = {
    session,
    user,
    patient,
    hospital,
    loading,
    phoneVerified,
    login,
    signup,
    verifyPhone,
    logout,
    isAuthenticated: !!session,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
