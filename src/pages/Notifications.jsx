import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/patientRequestService'
import { Bell, CheckCheck, FileText, CreditCard, Calendar, Pill, Receipt, Clock, RefreshCw } from 'lucide-react'

function formatTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const typeIcons = {
  lab_result: { icon: FileText, color: 'text-primary-500', bg: 'bg-primary-50' },
  invoice: { icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-50' },
  appointment: { icon: Calendar, color: 'text-primary-500', bg: 'bg-primary-50' },
  payment: { icon: Receipt, color: 'text-accent-500', bg: 'bg-accent-50' },
  refill: { icon: Pill, color: 'text-violet-500', bg: 'bg-violet-50' },
  document_request: { icon: FileText, color: 'text-violet-500', bg: 'bg-violet-50' },
  appointment_request: { icon: Calendar, color: 'text-primary-500', bg: 'bg-primary-50' },
  general: { icon: Bell, color: 'text-surface-400', bg: 'bg-surface-50' },
}

export default function Notifications() {
  const { patient } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async (isRefresh = false) => {
    if (!patient?.id) return
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const { data } = await fetchNotifications(patient.id)
      setNotifications(data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [patient?.id])

  useEffect(() => { loadData() }, [loadData])

  async function handleMarkRead(id) {
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function handleMarkAll() {
    await markAllNotificationsRead(patient.id)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (loading) return <div className="space-y-3"><div className="h-7 w-40 bg-surface-100 rounded-lg animate-pulse" />{[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 card-shadow h-16 animate-pulse" />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-surface-900">Notifications {unreadCount > 0 && <span className="ml-1 text-sm text-primary-500">({unreadCount} new)</span>}</h1>
        <div className="flex gap-2">
          <button onClick={() => loadData(true)} disabled={refreshing} className="p-2 rounded-lg text-surface-400"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
          {unreadCount > 0 && <button onClick={handleMarkAll} className="px-3 py-2 rounded-lg bg-primary-50 text-primary-600 text-xs font-semibold flex items-center gap-1.5"><CheckCheck size={14} /> Mark all read</button>}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl card-shadow p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3"><Bell size={28} className="text-surface-300" /></div>
          <p className="text-sm font-semibold text-surface-700">No notifications</p>
          <p className="text-xs text-surface-400 mt-1">You'll be notified when new results, bills, or appointments are available.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const typeInfo = typeIcons[n.type] || typeIcons.general
            const Icon = typeInfo.icon
            return (
              <button
                key={n.id}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
                className={`w-full bg-white rounded-2xl p-4 card-shadow text-left transition-all-smooth hover:card-shadow-lg ${!n.is_read ? 'border-l-4 border-primary-500' : 'opacity-70'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={18} className={typeInfo.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-surface-900 truncate">{n.title}</span>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
                    </div>
                    {n.body && <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    <div className="text-[10px] text-surface-400 mt-1">{formatTimeAgo(n.created_at)}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
