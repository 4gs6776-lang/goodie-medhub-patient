import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [patient, setPatient] = useState(null)
  const [hospital, setHospital] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phoneVerified, setPhoneVerified] = useState(false)

  // Stash the last-used lookup credentials (name, hospital_id, mrn) so
  // loadPatientData can fall back to them if the patient_users link is
  // missing. These come from the Login form.
  const pendingLookupRef = useRef(null)

  // -----------------------------------------------------------------
  // loadPatientData — find the patient record + hospital for the
  // currently-authenticated user.
  //
  // Lookup order (after the migration 070 fix):
  //   1. patient_users.user_id  (= auth.uid())  ← primary, always works
  //   2. patients table by (full_name + hospital_id + mrn)  ← fallback
  //      using the credentials the patient typed at login, stashed
  //      in pendingLookupRef.
  //
  // The old email-based fallback is REMOVED — it was unreliable
  // (multiple patients can share an email).
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

      // ---- Step 1: primary lookup via patient_users.user_id ----
      // After migration 070, user_id is uuid and auth.uid() is uuid,
      // so this comparison works without a type error.
      const { data: userRow, error: userErr } = await supabase
        .from('patient_users')
        .select('patient_id, hospital_id, is_active, patient_name, mrn')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle()

      if (userErr) {
        // If RLS still throws (shouldn't after the fix), fall through to
        // Step 2 instead of crashing the auth flow.
        console.warn('patient_users lookup returned an error (falling back to name+mrn):', userErr.message)
      }

      if (userRow?.patient_id) {
        // ---- Found the link — load the patient record ----
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('id', userRow.patient_id)
          .maybeSingle()

        if (!error && data) {
          patientData = data
          hospitalId = userRow.hospital_id || data.hospital_id
        }
      }

      // ---- Step 2: fallback lookup by name + hospital_id + mrn ----
      // Used when:
      //   - patient_users link doesn't exist yet (staff forgot to create it)
      //   - patient_users link was deactivated
      //   - the primary lookup errored
      if (!patientData && pendingLookupRef.current) {
        const { name, hospitalId: hid, mrn } = pendingLookupRef.current
        if (name && hid && mrn) {
          const { data: p, error: pErr } = await supabase
            .from('patients')
            .select('*')
            .eq('hospital_id', hid)
            .or(`hospital_number.eq.${mrn},mrn.eq.${mrn},patient_id.eq.${mrn}`)
            .ilike('full_name', name)
            .maybeSingle()

          if (!pErr && p) {
            patientData = p
            hospitalId = p.hospital_id

            // Auto-create the missing patient_users link so next time
            // Step 1 succeeds.
            try {
              await supabase.from('patient_users').upsert({
                user_id: authUser.id,
                patient_id: p.id,
                hospital_id: p.hospital_id,
                patient_name: p.full_name,
                mrn: p.hospital_number || p.mrn,
                is_relative: false,
                is_active: true,
              }, { onConflict: 'user_id,patient_id' })
            } catch (e) {
              console.warn('Auto-link patient_users failed (non-fatal):', e.message)
            }
          }
        }
      }

      if (!patientData) {
        console.warn('No patient record found for auth user:', authUser.id)
        setPatient(null)
        setHospital(null)
        return
      }

      setPatient(patientData)
      setPhoneVerified(false)

      // ---- Load the hospital ----
      if (hospitalId) {
        const { data: hospitalData, error: hospitalErr } = await supabase
          .from('hospitals')
          .select('*')
          .eq('id', hospitalId)
          .maybeSingle()

        if (!hospitalErr && hospitalData) {
          setHospital(hospitalData)
        }
      }
    } catch (err) {
      // CRITICAL: never let this throw — the old code's unhandled
      // rejection is what caused the auto-logout. Catch, log, and
      // leave patient state intact (the patient may still be able
      // to use parts of the app).
      console.error('loadPatientData error (suppressed to prevent auto-logout):', err)
    }
  }, [])

  // -----------------------------------------------------------------
  // Listen for auth state changes
  // -----------------------------------------------------------------
  useEffect(() => {
    let mounted = true

    // Get initial session
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

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return

        // Only treat SIGNED_OUT as a true logout. Don't bounce the
        // session on TOKEN_REFRESHED or INITIAL_SESSION — the old
        // code would set loading=true and re-render, which combined
        // with a transiently-null patient caused the auto-logout.
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
  // Login — patient no longer types their email.
  // They type (name + hospital_id + mrn + password). We resolve the
  // auth email via the lookup_portal_email RPC, then call Supabase's
  // standard email+password sign-in.
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
    // them if the patient_users link is missing.
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
  // Sign up (self-registration) — patient creates their own account
  // using name + hospital_id + mrn + email + password.
  // -----------------------------------------------------------------
  const signup = useCallback(async ({ name, hospitalId, mrn, email, password }) => {
    if (!name || !hospitalId || !mrn || !email || !password) {
      return { data: null, error: { message: 'All fields are required.' } }
    }

    // Step 1: look up the patient record by (hospital_id + mrn)
    const { data: patientData, error: lookupError } = await supabase
      .from('patients')
      .select('id, hospital_id, full_name, email, phone, hospital_number, mrn')
      .eq('hospital_id', hospitalId)
      .or(`hospital_number.eq.${mrn.trim()},mrn.eq.${mrn.trim()},patient_id.eq.${mrn.trim()}`)
      .maybeSingle()

    if (lookupError || !patientData) {
      return {
        data: null,
        error: {
          message: 'Hospital number not found at this hospital. Please check your details or ask your hospital to register you first.',
        },
      }
    }

    // Step 1b: verify the name matches (case-insensitive)
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (normalize(patientData.full_name) !== normalize(name)) {
      return {
        data: null,
        error: {
          message: 'The name you entered does not match the name on file for this hospital number. Please check and try again.',
        },
      }
    }

    // Step 2: check if a portal account already exists for this patient
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

    // Step 3: create the Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (authError) {
      return { data: null, error: authError }
    }

    if (!authData?.user?.id) {
      return { data: null, error: { message: 'Account creation returned no user ID. Please try again.' } }
    }

    // Step 4: link the auth account to the patient record
    // Including patient_name + mrn so the new lookup_portal_email RPC
    // can resolve them on the next login.
    const { error: linkError } = await supabase
      .from('patient_users')
      .insert({
        user_id: authData.user.id,
        patient_id: patientData.id,
        hospital_id: patientData.hospital_id,
        patient_name: patientData.full_name,
        mrn: patientData.hospital_number || patientData.mrn || mrn.trim(),
        is_relative: false,
        is_active: true,
      })

    if (linkError) {
      console.error('Failed to link patient_users:', linkError)
      // The auth account was created but the link failed — patient can
      // still log in next time using email + password (the old flow),
      // but the new RPC lookup won't find them. We surface this as a
      // soft error so the patient can contact their hospital.
      return {
        data: authData,
        error: {
          message: 'Account created but we could not link it to your patient record. Please contact your hospital to complete the setup.',
        },
      }
    }

    // Stash the lookup credentials so loadPatientData works immediately
    pendingLookupRef.current = {
      name: patientData.full_name,
      hospitalId: patientData.hospital_id,
      mrn: patientData.hospital_number || patientData.mrn || mrn.trim(),
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
