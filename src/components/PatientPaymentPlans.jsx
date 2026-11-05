// src/portal/components/PatientPaymentPlans.jsx
// Patient-facing view of their own payment plans + reminder history.
// Uses JWT-based patient_id from auth.user_metadata.

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency, getPlanProgress } from '../../lib/revenueCycle';

export default function PatientPaymentPlans() {
  const [plans, setPlans] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('plans');

  useEffect(() => {
    load();
    // Subscribe to reminder updates
    const sub = supabase
      .channel('patient-reminders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_reminders' },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const patientId = user?.user_metadata?.patient_id;
      if (!patientId) return;

      const [plansResp, remindersResp] = await Promise.all([
        supabase
          .from('payment_plans')
          .select(`
            *,
            installments:payment_plan_installments(*)
          `)
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoice_reminders')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setPlans(plansResp.data || []);
      setReminders(remindersResp.data || []);
    } catch (e) {
      console.error('PatientPaymentPlans load:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="portal-payment-plans">
      <h2>My Payment Plans & Reminders</h2>

      <div className="portal-tabs">
        <button
          className={`portal-tab ${tab === 'plans' ? 'active' : ''}`}
          onClick={() => setTab('plans')}
        >
          Payment Plans ({plans.length})
        </button>
        <button
          className={`portal-tab ${tab === 'reminders' ? 'active' : ''}`}
          onClick={() => setTab('reminders')}
        >
          Reminders ({reminders.length})
        </button>
      </div>

      {loading ? (
        <div className="portal-loading">Loading...</div>
      ) : tab === 'plans' ? (
        <div className="portal-plans-list">
          {plans.length === 0 ? (
            <div className="portal-empty">
              No active payment plans. Contact the billing office to set one up.
            </div>
          ) : plans.map(plan => {
            const progress = getPlanProgress(plan, plan.installments || []);
            const next = progress.nextInstallment;
            return (
              <div key={plan.id} className="portal-plan-card">
                <div className="portal-plan-header">
                  <div>
                    <h3>Plan — {formatCurrency(plan.total_amount)}</h3>
                    <p className="portal-plan-meta">
                      {plan.installment_count}× {plan.frequency} installments ·{' '}
                      Started {plan.start_date}
                    </p>
                  </div>
                  <span className={`portal-pill portal-pill-${plan.status}`}>
                    {plan.status}
                  </span>
                </div>

                <div className="portal-progress">
                  <div className="portal-progress-bar" style={{ width: `${progress.pct}%` }} />
                </div>
                <div className="portal-progress-meta">
                  <span>{formatCurrency(progress.paid)} paid ({progress.pct}%)</span>
                  <span>{formatCurrency(progress.remaining)} remaining</span>
                </div>

                {next && (
                  <div className="portal-next-installment">
                    <strong>Next due:</strong>{' '}
                    {formatCurrency(next.amount_due - (next.amount_paid || 0))} on {next.due_date}
                  </div>
                )}

                <details className="portal-installments">
                  <summary>View all installments ({plan.installments?.length || 0})</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(plan.installments || []).map(i => (
                        <tr key={i.id}>
                          <td>{i.installment_no}</td>
                          <td>{i.due_date}</td>
                          <td>{formatCurrency(i.amount_due)}</td>
                          <td>{formatCurrency(i.amount_paid || 0)}</td>
                          <td>
                            <span className={`portal-pill portal-pill-${i.status}`}>
                              {i.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="portal-reminders-list">
          {reminders.length === 0 ? (
            <div className="portal-empty">No reminders received yet.</div>
          ) : reminders.map(r => (
            <div key={r.id} className="portal-reminder-card">
              <div className="portal-reminder-header">
                <span className={`portal-pill portal-pill-${r.status}`}>{r.status}</span>
                <span className="portal-reminder-date">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="portal-reminder-body">{r.message_body}</p>
              {r.amount_outstanding > 0 && (
                <p className="portal-reminder-amount">
                  Outstanding: {formatCurrency(r.amount_outstanding)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
