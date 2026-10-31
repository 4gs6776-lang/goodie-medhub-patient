import { supabase } from './supabaseClient'

// =====================================================================
// patientRequestService — all queries for Phase 4 features
// (appointment requests, refill requests, document requests,
//  notifications, relatives)
// =====================================================================

// ---- Appointment Requests ----
export async function fetchAppointmentRequests(patientId, hospitalId) {
  const { data, error } = await supabase
    .from('appointment_requests')
    .select('*')
    .eq('patient_id', patientId)
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function createAppointmentRequest(patientId, hospitalId, patientName, payload) {
  const { data, error } = await supabase
    .from('appointment_requests')
    .insert({
      hospital_id: hospitalId,
      patient_id: patientId,
      patient_name: patientName,
      preferred_date: payload.preferredDate,
      preferred_time: payload.preferredTime,
      department: payload.department || null,
      reason: payload.reason || null,
      status: 'pending',
    })
    .select()
    .single()

  if (!error) {
    await supabase.from('patient_notifications').insert({
      hospital_id: hospitalId, patient_id: patientId,
      type: 'appointment_request', title: 'Appointment Request Submitted',
      body: `Your request for ${payload.preferredDate} (${payload.preferredTime || 'any time'}) has been submitted. We'll confirm shortly.`,
      link_to: '/appointments', ref_id: data?.id,
    })
  }
  return { data, error }
}

export async function cancelAppointmentRequest(requestId) {
  const { data, error } = await supabase
    .from('appointment_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', requestId)
  return { data, error }
}

// ---- Refill Requests ----
export async function fetchRefillRequests(patientId, hospitalId) {
  const { data, error } = await supabase
    .from('refill_requests')
    .select('*')
    .eq('patient_id', patientId)
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function createRefillRequest(patientId, hospitalId, patientName, payload) {
  const { data, error } = await supabase
    .from('refill_requests')
    .insert({
      hospital_id: hospitalId, patient_id: patientId, patient_name: patientName,
      medication_name: payload.medicationName,
      dosage: payload.dosage || null,
      quantity: payload.quantity || null,
      reason: payload.reason || null,
      status: 'pending',
    })
    .select()
    .single()

  if (!error) {
    await supabase.from('patient_notifications').insert({
      hospital_id: hospitalId, patient_id: patientId,
      type: 'refill', title: 'Refill Request Submitted',
      body: `Your refill request for ${payload.medicationName} has been submitted.`,
      link_to: '/prescriptions', ref_id: data?.id,
    })
  }
  return { data, error }
}

// ---- Document Requests ----
export async function fetchDocumentRequests(patientId, hospitalId) {
  const { data, error } = await supabase
    .from('document_requests')
    .select('*')
    .eq('patient_id', patientId)
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function createDocumentRequest(patientId, hospitalId, patientName, payload) {
  const { data, error } = await supabase
    .from('document_requests')
    .insert({
      hospital_id: hospitalId, patient_id: patientId, patient_name: patientName,
      document_type: payload.documentType,
      reason: payload.reason || null,
      status: 'pending',
    })
    .select()
    .single()

  if (!error) {
    await supabase.from('patient_notifications').insert({
      hospital_id: hospitalId, patient_id: patientId,
      type: 'document_request', title: 'Document Request Submitted',
      body: `Your request for a ${payload.documentType.replace(/_/g, ' ')} has been submitted.`,
      link_to: '/documents', ref_id: data?.id,
    })
  }
  return { data, error }
}

// ---- Notifications ----
export async function fetchNotifications(patientId) {
  const { data, error } = await supabase
    .from('patient_notifications')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(50)
  return { data: data || [], error }
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('patient_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
  return { error }
}

export async function markAllNotificationsRead(patientId) {
  const { error } = await supabase
    .from('patient_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('patient_id', patientId)
    .eq('is_read', false)
  return { error }
}

// ---- Patient Users (for relative access + patient_users linking) ----
export async function fetchPatientUser(userId) {
  const { data, error } = await supabase
    .from('patient_users')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return { data, error }
}

export async function createPatientUser(userId, patientId, hospitalId) {
  const { data, error } = await supabase
    .from('patient_users')
    .insert({
      user_id: userId, patient_id: patientId, hospital_id: hospitalId,
      is_relative: false, is_active: true,
    })
    .select()
    .single()
  return { data, error }
}

// ---- Relatives ----
export async function fetchRelatives(patientId, hospitalId) {
  const { data, error } = await supabase
    .from('patient_relatives')
    .select('*')
    .eq('primary_patient_id', patientId)
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function addRelative(patientId, hospitalId, relativePatientId, relationship, grantedBy) {
  const { data, error } = await supabase
    .from('patient_relatives')
    .insert({
      hospital_id: hospitalId,
      primary_patient_id: patientId,
      relative_patient_id: relativePatientId,
      relationship: relationship,
      granted_by: grantedBy,
      is_active: true,
    })
    .select()
    .single()
  return { data, error }
}

export async function revokeRelative(relativeId) {
  const { data, error } = await supabase
    .from('patient_relatives')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', relativeId)
  return { data, error }
}
