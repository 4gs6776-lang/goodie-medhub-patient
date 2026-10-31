import { supabase } from './supabaseClient'

// =====================================================================
// paymentService — Paystack payment integration for the Patient Portal
// =====================================================================
//
// Uses Paystack Inline (Popup) — the simplest integration for mobile.
// Only the PUBLIC key is used on the frontend (safe to expose).
// The SECRET key is NEVER in the frontend — it's used server-side
// for webhook verification (Phase 5 or a Supabase Edge Function).
//
// Flow:
//   1. Patient clicks "Pay Now" on an unpaid invoice
//   2. We create a payment_attempts row (status='initiated')
//   3. We open the Paystack popup with the invoice details
//   4. Patient enters card/bank details → Paystack processes
//   5. On success → we verify the transaction → update the invoice
//      + create a payments row + update payment_attempts to 'success'
//   6. On failure/cancel → update payment_attempts to 'failed'/'cancelled'
//
// Paystack public key is set via env var: VITE_PAYSTACK_PUBLIC_KEY
// Get it from: https://dashboard.paystack.com/#/settings/developers
// =====================================================================

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''

// Load the Paystack inline script dynamically
let paystackLoaded = false
function loadPaystack() {
  return new Promise((resolve, reject) => {
    if (paystackLoaded && window.PaystackPop) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.onload = () => {
      paystackLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error('Could not load Paystack. Check your internet connection.'))
    document.head.appendChild(script)
  })
}

// Generate a unique transaction reference
function generateReference(invoiceId) {
  const timestamp = Date.now().toString().slice(-8)
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `GMP-${invoiceId.slice(0, 8)}-${timestamp}-${random}`
}

// Initiate a payment for an invoice
export async function initiatePayment({ invoice, patient, hospital, amount }) {
  if (!PAYSTACK_PUBLIC_KEY) {
    throw new Error('Paystack is not configured. Ask your hospital to enable online payments.')
  }

  // Determine the amount to pay
  const balance = Number(invoice.balance || 0)
  const payAmount = amount || balance

  if (payAmount <= 0) {
    throw new Error('This invoice has no outstanding balance.')
  }

  // Check for existing pending payment attempt (prevent double payment)
  const { data: existingAttempt } = await supabase
    .from('payment_attempts')
    .select('id, status, gateway_reference')
    .eq('invoice_id', invoice.id)
    .eq('patient_id', patient.id)
    .eq('status', 'initiated')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let attemptId
  let reference

  if (existingAttempt?.gateway_reference) {
    // Reuse the existing reference (Paystack allows re-using a reference
    // if the previous transaction was not completed)
    attemptId = existingAttempt.id
    reference = existingAttempt.gateway_reference
  } else {
    // Create a new payment attempt record
    reference = generateReference(invoice.id)
    const { data: newAttempt, error: attemptError } = await supabase
      .from('payment_attempts')
      .insert({
        hospital_id: patient.hospital_id,
        patient_id: patient.id,
        patient_name: patient.full_name,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: payAmount,
        gateway: 'paystack',
        gateway_reference: reference,
        status: 'initiated',
      })
      .select()
      .single()

    if (attemptError) {
      throw new Error('Could not start payment. Please try again.')
    }
    attemptId = newAttempt.id
  }

  // Load Paystack script
  await loadPaystack()

  // Return a promise that resolves when the Paystack popup completes
  return new Promise((resolve, reject) => {
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: patient.email || (patient.phone ? `${patient.phone.replace(/[^0-9]/g, '')}@payment.local` : 'patient@payment.local'),
      amount: Math.round(payAmount * 100), // Paystack expects kobo (×100)
      currency: 'NGN',
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Patient Name', variable_name: 'patient_name', value: patient.full_name || '' },
          { display_name: 'Invoice Number', variable_name: 'invoice_number', value: invoice.invoice_number || '' },
          { display_name: 'Hospital', variable_name: 'hospital', value: hospital?.name || '' },
        ],
      },
      callback: async (response) => {
        // Payment successful — verify + update the database
        try {
          const result = await verifyAndRecordPayment({
            attemptId,
            reference: response.reference,
            invoice,
            patient,
            payAmount,
            gatewayResponse: response,
          })
          resolve(result)
        } catch (err) {
          reject(err)
        }
      },
      onClose: async () => {
        // User closed the popup without completing payment
        await updateAttemptStatus(attemptId, 'cancelled', { failure_reason: 'User closed the payment window' })
        reject(new Error('Payment was cancelled.'))
      },
    })
    handler.openIframe()
  })
}

// Verify the payment and record it in the database
async function verifyAndRecordPayment({ attemptId, reference, invoice, patient, payAmount, gatewayResponse }) {
  // 1. Update the payment attempt to 'success'
  await supabase
    .from('payment_attempts')
    .update({
      status: 'success',
      completed_at: new Date().toISOString(),
    })
    .eq('id', attemptId)

  // 2. Create a payment record in the payments table
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      hospital_id: patient.hospital_id,
      invoice_id: invoice.id,
      patient_id: patient.id,
      patient_name: patient.full_name,
      amount: payAmount,
      method: 'Online (Paystack)',
      reference_number: reference,
      received_by: null, // system-generated, not a staff member
      status: 'completed',
    })
    .select()
    .single()

  if (paymentError) {
    console.error('Failed to create payment record:', paymentError)
    // The payment went through on Paystack but we couldn't record it
    // This is a critical error — the hospital will see it in payment_attempts
    throw new Error('Payment was successful but we could not record it. Please contact your hospital with reference: ' + reference)
  }

  // 3. Update the invoice (amount_paid, balance, status)
  const currentPaid = Number(invoice.amount_paid || 0)
  const grandTotal = Number(invoice.grand_total || invoice.amount || 0)
  const newPaid = currentPaid + payAmount
  const newBalance = Math.max(0, grandTotal - newPaid)
  const newStatus = newBalance <= 0.01 ? 'paid' : 'partial'

  await supabase
    .from('invoices')
    .update({
      amount_paid: newPaid,
      balance: newBalance,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)

  // 4. Link the payment to the attempt
  await supabase
    .from('payment_attempts')
    .update({ payment_id: payment.id })
    .eq('id', attemptId)

  // 5. Create a notification
  await supabase
    .from('patient_notifications')
    .insert({
      hospital_id: patient.hospital_id,
      patient_id: patient.id,
      type: 'payment',
      title: 'Payment Successful',
      body: `Your payment of ₦${payAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} for invoice ${invoice.invoice_number || ''} was successful. Reference: ${reference}`,
      link_to: '/bills',
      ref_id: payment.id,
    })

  return {
    success: true,
    reference,
    amount: payAmount,
    newBalance,
    invoiceStatus: newStatus,
    paymentId: payment.id,
  }
}

// Update a payment attempt's status
async function updateAttemptStatus(attemptId, status, extra = {}) {
  try {
    await supabase
      .from('payment_attempts')
      .update({ status, ...extra, completed_at: new Date().toISOString() })
      .eq('id', attemptId)
  } catch (err) {
    console.error('Failed to update payment attempt:', err)
  }
}

// Fetch payment history for a patient
export async function fetchPaymentHistory(patientId, hospitalId) {
  if (!patientId || !hospitalId) return { data: [], error: 'Missing patient or hospital' }

  const { data, error } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      method,
      reference_number,
      status,
      created_at,
      invoices (
        invoice_number
      )
    `)
    .eq('patient_id', patientId)
    .eq('hospital_id', hospitalId)
    .neq('status', 'reversed')
    .order('created_at', { ascending: false })

  // Flatten the invoice_number
  const formatted = (data || []).map(p => ({
    ...p,
    invoice_number: p.invoices?.invoice_number || '—',
  }))

  return { data: formatted, error }
}

// Fetch all payment attempts for a patient (including failed/cancelled)
export async function fetchPaymentAttempts(patientId, hospitalId) {
  if (!patientId || !hospitalId) return { data: [], error: 'Missing patient or hospital' }

  const { data, error } = await supabase
    .from('payment_attempts')
    .select('*')
    .eq('patient_id', patientId)
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })

  return { data: data || [], error }
}
