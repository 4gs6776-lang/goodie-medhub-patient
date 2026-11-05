// patient-portal/src/main.jsx
// COMPLETE drop-in replacement (no patching required).
//
// Adds the new /payment-plans route that exposes the
// PatientPaymentPlans component (shows the patient's active plans,
// installments, and reminder history).
//
// This file REPLACES your existing patient-portal/src/main.jsx.
// It's the same as your current one, with two additions:
//   1. import PatientPaymentPlans from './components/PatientPaymentPlans'
//   2. <Route path="/payment-plans" element={<PatientPaymentPlans />} />
//
// Make sure your old main.jsx has the same imports — if you've customized
// it, copy the two additions above into your version instead.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import VerifyPhone from './pages/VerifyPhone'
import NoRecord from './pages/NoRecord'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Results from './pages/Results'
import Bills from './pages/Bills'
import Appointments from './pages/Appointments'
import Documents from './pages/Documents'
import Prescriptions from './pages/Prescriptions'
import Notifications from './pages/Notifications'
import PatientPaymentPlans from './components/PatientPaymentPlans'   // NEW
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify-phone" element={<VerifyPhone />} />
          <Route path="/no-record" element={<NoRecord />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/results" element={<Results />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/prescriptions" element={<Prescriptions />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/payment-plans" element={<PatientPaymentPlans />} />   {/* NEW */}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
