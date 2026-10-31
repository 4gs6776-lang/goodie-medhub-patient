import { useAuth } from '../context/AuthContext'
import { X, Printer, CheckCircle2, Calendar, CreditCard, FileText } from 'lucide-react'

export default function PaymentReceipt({ payment, hospital, patient, onClose }) {
  if (!payment) return null

  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const formatTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-accent-500" />
            <h2 className="text-base font-bold text-surface-900">Payment Successful</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:bg-surface-50">
            <X size={20} />
          </button>
        </div>

        {/* Receipt body */}
        <div className="p-5 space-y-4" id="receipt-content">
          {/* Hospital header */}
          <div className="text-center pb-4 border-b border-dashed border-surface-200">
            <h3 className="text-lg font-bold text-surface-900">{hospital?.name || 'Hospital'}</h3>
            {hospital?.phone && <p className="text-xs text-surface-400 mt-1">{hospital.phone}</p>}
            <p className="text-[10px] text-surface-300 mt-1 uppercase tracking-wider">Payment Receipt</p>
          </div>

          {/* Success check */}
          <div className="flex flex-col items-center py-2">
            <div className="w-14 h-14 rounded-full bg-accent-50 flex items-center justify-center mb-2">
              <CheckCircle2 size={32} className="text-accent-500" />
            </div>
            <div className="text-2xl font-bold text-surface-900">{formatMoney(payment.amount)}</div>
            <div className="text-xs text-accent-600 font-semibold mt-1">PAID SUCCESSFULLY</div>
          </div>

          {/* Details */}
          <div className="space-y-2.5 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Receipt No</span>
              <span className="font-mono font-semibold text-surface-700">{payment.reference_number || payment.reference || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Patient Name</span>
              <span className="font-semibold text-surface-700">{patient?.full_name || '—'}</span>
            </div>
            {payment.invoice_number && (
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Invoice</span>
                <span className="font-semibold text-surface-700">{payment.invoice_number}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Date</span>
              <span className="font-semibold text-surface-700">{formatDate(payment.created_at || new Date())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Time</span>
              <span className="font-semibold text-surface-700">{formatTime(payment.created_at || new Date())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Payment Method</span>
              <span className="font-semibold text-surface-700">{payment.method || 'Online (Paystack)'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Amount</span>
              <span className="font-bold text-surface-900">{formatMoney(payment.amount)}</span>
            </div>
            {payment.newBalance !== undefined && (
              <div className="flex justify-between text-sm pt-2 border-t border-dashed border-surface-200">
                <span className="text-surface-400">Remaining Balance</span>
                <span className={`font-bold ${payment.newBalance > 0.01 ? 'text-amber-600' : 'text-accent-600'}`}>
                  {formatMoney(payment.newBalance)}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-dashed border-surface-200 text-center">
            <p className="text-[10px] text-surface-300">
              This is a computer-generated receipt. Thank you for your payment.
            </p>
            {payment.reference && (
              <p className="text-[10px] text-surface-300 mt-1">
                Transaction Reference: {payment.reference}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-2 border-t border-surface-100">
          <button
            onClick={() => window.print()}
            className="flex-1 py-3 rounded-xl bg-surface-100 hover:bg-surface-200 text-surface-600 font-semibold text-sm flex items-center justify-center gap-2 transition-all-smooth"
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-sm transition-all-smooth"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
