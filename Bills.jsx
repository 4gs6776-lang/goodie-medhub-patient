import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchInvoices, fetchPayments } from '../lib/patientDataService'
import { initiatePayment, fetchPaymentHistory } from '../lib/paymentService'
import PaymentReceipt from '../components/PaymentReceipt'
import { CreditCard, ChevronRight, RefreshCw, Clock, CheckCircle2, Receipt, AlertCircle, Loader2, ArrowLeft, Wallet } from 'lucide-react'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatMoney(n) {
  return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function statusBadge(status) {
  const s = (status || '').toLowerCase()
  if (s === 'paid') return { label: 'Paid', color: 'text-accent-600', bg: 'bg-accent-50', icon: CheckCircle2 }
  if (s === 'partial') return { label: 'Partial', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock }
  if (s === 'unpaid') return { label: 'Unpaid', color: 'text-red-500', bg: 'bg-red-50', icon: Clock }
  return { label: status || '—', color: 'text-surface-500', bg: 'bg-surface-50', icon: Receipt }
}

export default function Bills() {
  const { patient, hospital } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [invoicePayments, setInvoicePayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('invoices') // 'invoices' | 'history' | 'detail'
  const [paying, setPaying] = useState(false)
  const [paymentResult, setPaymentResult] = useState(null)
  const [payError, setPayError] = useState('')

  const loadData = useCallback(async (isRefresh = false) => {
    if (!patient?.id) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const [invRes, payRes] = await Promise.all([
        fetchInvoices(patient.id, patient.hospital_id),
        fetchPaymentHistory(patient.id, patient.hospital_id),
      ])
      if (invRes.error) setError(invRes.error)
      else setInvoices(invRes.data || [])
      setPayments(payRes.data || [])
    } catch (err) {
      setError(err.message || 'Could not load data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [patient?.id, patient?.hospital_id])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!selectedInvoice?.id) return
    setLoadingPayments(true)
    fetchPayments(selectedInvoice.id, patient.hospital_id)
      .then(({ data }) => setInvoicePayments(data || []))
      .catch(() => setInvoicePayments([]))
      .finally(() => setLoadingPayments(false))
  }, [selectedInvoice?.id, patient?.hospital_id])

  async function handlePay(invoice) {
    setPaying(true)
    setPayError('')
    try {
      const result = await initiatePayment({
        invoice,
        patient,
        hospital,
        amount: Number(invoice.balance || 0),
      })
      setPaymentResult({ ...result, ...invoice, created_at: new Date().toISOString() })
      // Reload invoices to reflect the updated balance
      await loadData(true)
    } catch (err) {
      setPayError(err.message || 'Payment failed. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-7 w-40 bg-surface-100 rounded-lg animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl p-4 card-shadow h-20 animate-pulse" />)}
      </div>
    )
  }

  // Payment receipt modal
  if (paymentResult) {
    return (
      <PaymentReceipt
        payment={paymentResult}
        hospital={hospital}
        patient={patient}
        onClose={() => { setPaymentResult(null); setView('invoices') }}
      />
    )
  }

  // Invoice detail view
  if (view === 'detail' && selectedInvoice) {
    const badge = statusBadge(selectedInvoice.status)
    const grandTotal = Number(selectedInvoice.grand_total || selectedInvoice.amount || 0)
    const amountPaid = Number(selectedInvoice.amount_paid || 0)
    const balance = Number(selectedInvoice.balance || 0)

    return (
      <div className="space-y-4">
        <button onClick={() => setView('invoices')} className="flex items-center gap-2 text-sm text-primary-500 font-medium">
          <ArrowLeft size={16} /> Back to Bills
        </button>

        <div className="bg-white rounded-2xl card-shadow overflow-hidden">
          <div className="p-4 border-b border-surface-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-surface-900">{selectedInvoice.invoice_number || 'Invoice'}</h2>
                <p className="text-xs text-surface-400 mt-0.5">{formatDate(selectedInvoice.created_at)}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-surface-400">Total</span><span className="font-bold text-surface-900">{formatMoney(grandTotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-surface-400">Paid</span><span className="font-bold text-accent-600">{formatMoney(amountPaid)}</span></div>
            <div className="border-t border-surface-100 pt-3 flex justify-between">
              <span className="text-sm font-semibold text-surface-600">Balance Due</span>
              <span className={`text-lg font-bold ${balance > 0.01 ? 'text-red-500' : 'text-accent-600'}`}>{formatMoney(balance)}</span>
            </div>
          </div>
        </div>

        {/* Pay Now button */}
        {balance > 0.01 && (
          <div className="space-y-3">
            <button
              onClick={() => handlePay(selectedInvoice)}
              disabled={paying}
              className="w-full py-3.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all-smooth disabled:opacity-50"
            >
              {paying ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : <><CreditCard size={18} /> Pay {formatMoney(balance)} Now</>}
            </button>
            {payError && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{payError}</div>}
            <p className="text-xs text-surface-400 text-center">Secure payment powered by Paystack</p>
          </div>
        )}

        {/* Payment history for this invoice */}
        <div className="bg-white rounded-2xl card-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100">
            <h3 className="text-sm font-bold text-surface-700">Payment History</h3>
          </div>
          {loadingPayments ? (
            <div className="p-4 space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-surface-50 rounded-lg animate-pulse" />)}</div>
          ) : invoicePayments.length === 0 ? (
            <div className="p-6 text-center"><p className="text-sm text-surface-400">No payments yet</p></div>
          ) : (
            invoicePayments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 border-b border-surface-100 last:border-0">
                <div>
                  <div className="text-sm font-semibold text-surface-700">{formatMoney(p.amount)}</div>
                  <div className="text-xs text-surface-400">{formatDate(p.created_at)} · {p.method || 'Cash'}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-50 text-accent-600">{p.status || 'confirmed'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Payment history view
  if (view === 'history') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('invoices')} className="flex items-center gap-2 text-sm text-primary-500 font-medium">
            <ArrowLeft size={16} /> Back to Bills
          </button>
          <button onClick={() => loadData(true)} disabled={refreshing} className="p-2 rounded-lg text-surface-400">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <h1 className="text-xl font-bold text-surface-900">Payment History</h1>
        {payments.length === 0 ? (
          <div className="bg-white rounded-2xl card-shadow p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3">
              <Wallet size={28} className="text-surface-300" />
            </div>
            <p className="text-sm font-semibold text-surface-700">No payments yet</p>
            <p className="text-xs text-surface-400 mt-1">Your payment history will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="bg-white rounded-2xl p-4 card-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-surface-900">{formatMoney(p.amount)}</div>
                    <div className="text-xs text-surface-400 mt-0.5">
                      {formatDate(p.created_at)} · {p.invoice_number || '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-50 text-accent-600">{p.status}</span>
                    <div className="text-[10px] text-surface-400 mt-1 font-mono">{p.reference_number?.slice(0, 20) || ''}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Main invoices list
  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balance || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900">Bills & Invoices</h1>
        <button onClick={() => loadData(true)} disabled={refreshing} className="p-2 rounded-lg text-surface-400 hover:text-primary-500">
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Outstanding balance + History button */}
      {totalOutstanding > 0.01 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-600 font-semibold">Total Outstanding</div>
            <div className="text-2xl font-bold text-amber-700 mt-0.5">{formatMoney(totalOutstanding)}</div>
          </div>
        </div>
      )}

      <button
        onClick={() => setView('history')}
        className="w-full py-3 rounded-xl bg-white card-shadow text-sm font-medium text-surface-600 flex items-center justify-between px-4 transition-all-smooth hover:card-shadow-lg"
      >
        <span className="flex items-center gap-2"><Wallet size={18} /> Payment History</span>
        <ChevronRight size={16} className="text-surface-300" />
      </button>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>}

      {invoices.length === 0 && !error ? (
        <div className="bg-white rounded-2xl card-shadow p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3">
            <CreditCard size={28} className="text-surface-300" />
          </div>
          <p className="text-sm font-semibold text-surface-700">No bills yet</p>
          <p className="text-xs text-surface-400 mt-1 max-w-xs">Your invoices will appear here once they are generated.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const badge = statusBadge(inv.status)
            const balance = Number(inv.balance || 0)
            const grandTotal = Number(inv.grand_total || inv.amount || 0)
            const canPay = balance > 0.01
            return (
              <div key={inv.id} className="bg-white rounded-2xl p-4 card-shadow">
                <button
                  onClick={() => { setSelectedInvoice(inv); setView('detail') }}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-surface-900">{inv.invoice_number || 'Invoice'}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
                      </div>
                      <div className="text-xs text-surface-400 mt-0.5">{formatDate(inv.created_at)}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-surface-900">{formatMoney(grandTotal)}</div>
                      {balance > 0.01 ? (
                        <div className="text-xs text-red-500 font-semibold">Bal: {formatMoney(balance)}</div>
                      ) : (
                        <div className="text-xs text-accent-500 font-semibold">Fully Paid</div>
                      )}
                    </div>
                  </div>
                </button>
                {/* Quick pay button */}
                {canPay && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePay(inv) }}
                    disabled={paying}
                    className="w-full mt-3 py-2.5 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-600 font-semibold text-xs flex items-center justify-center gap-2 transition-all-smooth disabled:opacity-50"
                  >
                    {paying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    Pay {formatMoney(balance)} Now
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
