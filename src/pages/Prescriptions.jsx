import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchRefillRequests, createRefillRequest } from '../lib/patientRequestService'
import { Plus, ArrowLeft, Send, RefreshCw, Pill, Clock, CheckCircle2, XCircle } from 'lucide-react'

function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }
function statusBadge(status) {
  const s = (status || '').toLowerCase()
  const map = {
    pending: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50' },
    approved: { label: 'Approved', color: 'text-accent-600', bg: 'bg-accent-50' },
    dispensed: { label: 'Dispensed', color: 'text-accent-600', bg: 'bg-accent-50' },
    rejected: { label: 'Rejected', color: 'text-red-500', bg: 'bg-red-50' },
    cancelled: { label: 'Cancelled', color: 'text-surface-400', bg: 'bg-surface-100' },
  }
  return map[s] || { label: status || '—', color: 'text-surface-500', bg: 'bg-surface-50' }
}

export default function Prescriptions() {
  const { patient } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ medicationName: '', dosage: '', quantity: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async (isRefresh = false) => {
    if (!patient?.id) return
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const { data, error } = await fetchRefillRequests(patient.id, patient.hospital_id)
      if (error) setError(error); else setRequests(data || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [patient?.id, patient?.hospital_id])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.medicationName.trim()) { setError('Medication name is required'); return }
    setSubmitting(true); setError('')
    try {
      const { error } = await createRefillRequest(patient.id, patient.hospital_id, patient.full_name, form)
      if (error) throw error
      setShowForm(false); setForm({ medicationName: '', dosage: '', quantity: '', reason: '' })
      loadData(true)
    } catch (err) { setError(err.message || 'Could not submit') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="space-y-3"><div className="h-7 w-40 bg-surface-100 rounded-lg animate-pulse" />{[1,2].map(i => <div key={i} className="bg-white rounded-2xl p-4 card-shadow h-20 animate-pulse" />)}</div>

  if (showForm) {
    return (
      <div className="space-y-4">
        <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-sm text-primary-500 font-medium"><ArrowLeft size={16} /> Back</button>
        <h1 className="text-xl font-bold text-surface-900">Request Refill</h1>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-2xl card-shadow p-5">
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Medication Name *</label>
            <input type="text" value={form.medicationName} onChange={e => setForm(f => ({ ...f, medicationName: e.target.value }))} placeholder="e.g. Amoxicillin 500mg" className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Dosage</label>
              <input type="text" value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g. 1 tab TDS" className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Quantity</label>
              <input type="text" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 2 packs" className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-surface-600 mb-1.5 block">Reason (optional)</label>
            <textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Running out, need more" className="w-full px-4 py-3 text-sm rounded-xl border border-surface-200 bg-surface-50 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
          </div>
          <button type="submit" disabled={submitting} className="w-full py-3.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={18} /> Submit Request</>}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900">Prescriptions</h1>
        <div className="flex gap-2">
          <button onClick={() => loadData(true)} disabled={refreshing} className="p-2 rounded-lg text-surface-400"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
          <button onClick={() => setShowForm(true)} className="p-2 rounded-lg bg-primary-500 text-white"><Plus size={18} /></button>
        </div>
      </div>
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>}
      {requests.length === 0 && !error ? (
        <div className="bg-white rounded-2xl card-shadow p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3"><Pill size={28} className="text-surface-300" /></div>
          <p className="text-sm font-semibold text-surface-700">No refill requests</p>
          <p className="text-xs text-surface-400 mt-1">Tap + to request a prescription refill.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const badge = statusBadge(req.status)
            return (
              <div key={req.id} className="bg-white rounded-2xl p-4 card-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0"><Pill size={18} className="text-primary-500" /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-surface-900 truncate">{req.medication_name}</div>
                      <div className="text-xs text-surface-400 mt-0.5">{formatDate(req.created_at)}{req.dosage ? ` · ${req.dosage}` : ''}{req.quantity ? ` · Qty: ${req.quantity}` : ''}</div>
                      {req.staff_notes && <div className="text-xs text-primary-600 mt-1 font-medium">Staff: {req.staff_notes}</div>}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
