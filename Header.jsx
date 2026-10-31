import { useAuth } from '../context/AuthContext'
import { Stethoscope, LogOut, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Header({ title }) {
  const { hospital, logout, patient } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!patient?.id) return
    // Fetch unread count
    supabase
      .from('patient_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patient.id)
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count || 0))

    // Subscribe to new notifications
    const channel = supabase
      .channel('patient-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patient_notifications', filter: `patient_id=eq.${patient.id}` },
        () => setUnreadCount(c => c + 1))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [patient?.id])

  return (
    <header className="safe-top bg-white border-b border-surface-200 sticky top-0 z-30">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {hospital?.logo_url ? (
            <img src={hospital.logo_url} alt={hospital?.name || 'Hospital'} className="w-9 h-9 rounded-lg object-contain flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0"><Stethoscope size={20} className="text-primary-500" /></div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-surface-900 truncate">{title || hospital?.name || 'GOODIE-MEDHUB'}</div>
            <div className="text-[10px] text-surface-400">Patient Portal</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/notifications')} className="relative p-2 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 transition-all-smooth" aria-label="Notifications">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          <button onClick={logout} className="p-2 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 transition-all-smooth" aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
