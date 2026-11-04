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
import PatientVirtualConsultation from './components/PatientVirtualConsultation'
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
            <Route path="/video-call/:roomId" element={
              <ProtectedRoute>
                <PatientVirtualConsultationWrapper />
              </ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// Wrapper component to extract roomId from URL params
function PatientVirtualConsultationWrapper() {
  const params = new URLSearchParams(window.location.search)
  const roomId = window.location.pathname.split('/video-call/')[1] || ''
  return <PatientVirtualConsultation roomId={roomId} onClose={() => window.location.href = '/appointments'} />
}
