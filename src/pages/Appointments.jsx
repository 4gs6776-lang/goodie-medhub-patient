import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchAppointments } from '../lib/patientDataService'
import { fetchAppointmentRequests, createAppointmentRequest, cancelAppointmentRequest } from '../lib/patientRequestService'
import { Calendar, Clock, CheckCircle2, XCircle, Plus, ArrowLeft, Send, RefreshCw, X, Video } from 'lucide-react'

function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }
function formatTime(d) { return d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '' }

function statusBadge(status) {
  const s = (status || '').toLowerCase()
  const map = {
    pending: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50' },
    approved: { label: 'Approved', color: 'text-accent-600', bg: 'bg-accent-50' },
    confirmed: { label: 'Confirmed', color: 'text-accent-600', bg: 'bg-accent-50' },
    rejected: { label: 'Rejected', color: 'text-red-500', bg: 'bg-red-50' },
    cancelled: { label: 'Cancelled', color: 'text-surface-400', bg: 'bg-surface-100' },
    completed: { label: 'Completed', color: 'text-accent-600', bg: 'bg-accent-50' },
    scheduled: { label: 'Scheduled', color: 'text-primary-600', bg: 'bg-primary-50' },
  }
  return map[s] || { label: status || '—', color: 'text-surface-500', bg: 'bg-surface-50' }
}

export default function Appointments() {
  const { patient, hospital } = useAuth()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [requests, setRequests] = useState([])
  const [virtualConsults, setVirtualConsults] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ preferredDate: '', preferredTime: 'morning', department: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async (isRefresh = false) => {
    if (!patient?.id) return
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [apptRes, reqRes] = await Promise.all([
        fetchAppointments(patient.id, patient.hospital_id),
        fetchAppointmentRequests(patient.id, patient.hospital_id),
      ])
      setAppointments(apptRes.data || [])
      setRequests(reqRes.data || [])

      // Fetch virtual consultations for this patient
      const { data: vcData } = await supabase
        .from('virtual_consultations')
        .select('*')
        .eq('hospital_id', patient.hospital_id)
        .eq('patient_id', patient.id)
        .in('status', ['scheduled', 'waiting', 'in_progress'])
        .order('scheduled_start', { ascending: true })
      setVirtualConsults(vcData || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [patient?.id, patient?.hospital_id])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.preferredDate) { setError('Please select a preferred date'); return }
    setSubmitting(true); setError('')
    try {
      const { error } = await createAppointmentRequest(patient.id, patient.hospital_id, patient.full_name, form)
      if (error) throw error
      setShowForm(false)
      setForm({ preferredDate: '', preferredTime: 'morning', department: '', reason: '' })
      loadData(true)
    } catch (err) { setError(err.message || 'Could not submit request') }
    finally { setSubmitting(false) }
  }

  async function handleCancel(requestId) {
    if (!confirm('Cancel this appointment request?')) return
    await cancelAppointmentRequest(requestId)
    loadData(true)
  }

  if (loading) return <div className="space-y-3"><div className="h-7 w-48 bg-surface-100 rounded-lg animate-pulse" />{[1,2].map(i => <div key={i} className="bg-white rounded-2xl p-4 card-shadow h-24 animate-pulse" />)}</div>

  // Request form
  if (showForm) {
    return (
      <div className="space-y-4">
        <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-sm text-primary-500 font-medium">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-bold text-surface-900">Request Appointment</h1>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-2xl card-shadow p-5">
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Preferred Date *</label>
            <input type="date" value={form.preferredDate} onChange={e => setForm(f => ({ ...f, preferredDate: e.target.value }))} min={new Date().toISOString().slice(0,10)} className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Preferred Time</label>
            <select value={form.preferredTime} onChange={e => setForm(f => ({ ...f, preferredTime: e.target.value }))} className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none">
              <option value="morning">Morning (8am - 12pm)</option>
              <option value="afternoon">Afternoon (12pm - 5pm)</option>
              <option value="evening">Evening (5pm - 8pm)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Department (optional)</label>
            <input type="text" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. General, Cardiology" className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Reason for Visit</label>
            <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Briefly describe your symptoms or reason" className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
          </div>
          <button type="submit" disabled={submitting} className="w-full py-3.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={18} /> Submit Request</>}
          </button>
        </form>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = appointments.filter(a => (a.appointment_date || a.date || '') >= today).reverse()
  const past = appointments.filter(a => (a.appointment_date || a.date || '') < today)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900">Appointments</h1>
        <div className="flex gap-2">
          <button onClick={() => loadData(true)} disabled={refreshing} className="p-2 rounded-lg text-surface-400"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
          <button onClick={() => setShowForm(true)} className="p-2 rounded-lg bg-primary-500 text-white"><Plus size={18} /></button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>}

      {/* Appointment Requests */}
      {requests.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-surface-600 mb-2">My Requests</h2>
          <div className="space-y-2">
            {requests.map(req => {
              const badge = statusBadge(req.status)
              return (
                <div key={req.id} className="bg-white rounded-2xl p-4 card-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-surface-900">{formatDate(req.preferred_date)}</div>
                      <div className="text-xs text-surface-400 mt-0.5 capitalize">{req.preferred_time || 'Any time'}{req.department ? ` · ${req.department}` : ''}</div>
                      {req.reason && <div className="text-xs text-surface-500 mt-1">{req.reason}</div>}
                      {req.staff_notes && <div className="text-xs text-primary-600 mt-1 font-medium">Staff: {req.staff_notes}</div>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
                      {req.status === 'pending' && <button onClick={() => handleCancel(req.id)} className="p-1 text-surface-300 hover:text-red-500"><X size={14} /></button>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Virtual Consultations */}
      {virtualConsults.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-surface-600 mb-2 flex items-center gap-1.5">
            <Video size={14} className="text-primary-500" /> Virtual Consultations
          </h2>
          <div className="space-y-2">
            {virtualConsults.map(vc => (
              <div key={vc.id} className="bg-white rounded-2xl p-4 card-shadow border border-primary-100">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-surface-900">
                      {formatDate(vc.scheduled_start)}
                    </div>
                    <div className="text-xs text-surface-400 mt-0.5">
                      {formatTime(vc.scheduled_start) || 'Any time'}
                      {vc.doctor_name ? ` · Dr. ${vc.doctor_name}` : ''}
                    </div>
                    <div className="text-xs text-primary-600 mt-1 font-medium">
                      Status: {vc.status === 'in_progress' ? 'In progress — join now!' : vc.status === 'waiting' ? 'Doctor is waiting — join now!' : 'Scheduled'}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/video-call/${vc.room_id}`)}
                    className="px-3 py-2 rounded-xl bg-primary-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Video size={14} /> Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-surface-600 mb-2">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map(apt => {
              const badge = statusBadge(apt.status)
              return (
                <div key={apt.id} className="bg-white rounded-2xl p-4 card-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-surface-900">{formatDate(apt.appointment_date || apt.date)}</div>
                      <div className="text-xs text-surface-400 mt-0.5">{formatTime(apt.appointment_date || apt.date) || 'All day'}{apt.doctor_name ? ` · ${apt.doctor_name}` : ''}{apt.department ? ` · ${apt.department}` : ''}</div>
                      {apt.reason && <div className="text-xs text-surface-500 mt-1">{apt.reason}</div>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-surface-400 mb-2">Past Appointments</h2>
          <div className="space-y-2">
            {past.map(apt => {
              const badge = statusBadge(apt.status)
              return (
                <div key={apt.id} className="bg-white rounded-xl p-3.5 card-shadow opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-surface-700">{formatDate(apt.appointment_date || apt.date)}</div>
                      <div className="text-xs text-surface-400">{apt.doctor_name || apt.department || '—'}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {appointments.length === 0 && requests.length === 0 && !error && (
        <div className="bg-white rounded-2xl card-shadow p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3"><Calendar size={28} className="text-surface-300" /></div>
          <p className="text-sm font-semibold text-surface-700">No appointments</p>
          <p className="text-xs text-surface-400 mt-1 max-w-xs">Tap the + button to request an appointment.</p>
        </div>
      )}
    </div>
  )
}
