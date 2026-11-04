import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { useWebRTC } from '../lib/useWebRTC'
import { Video, VideoOff, Mic, MicOff, PhoneOff, Send, X, MessageSquare } from 'lucide-react'

// =====================================================================
// PatientVirtualConsultation — the patient-side video call component
// =====================================================================
// This is the patient-facing version of the virtual consultation.
// The patient joins from the patient portal when they have a scheduled
// virtual consultation.
//
// Key differences from the doctor side:
//   - isInitiator: false (the patient is the "responder" — waits for
//     the doctor's offer before creating an answer)
//   - Reads the virtual_consultations row by room_id
//   - Shows the doctor's video as the remote stream
//   - Patient's own video is the local stream (picture-in-picture)
// =====================================================================

export default function PatientVirtualConsultation({ roomId, onClose }) {
  const { patient, hospital } = useAuth()
  const [consultation, setConsultation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([])
  const [showChat, setShowChat] = useState(true)
  const [callDuration, setCallDuration] = useState(0)
  const [callEnded, setCallEnded] = useState(false)
  const messagesEndRef = useRef(null)
  const callTimerRef = useRef(null)

  // Load the virtual consultation + messages
  useEffect(() => {
    async function loadConsultation() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('virtual_consultations')
          .select('*')
          .eq('room_id', roomId)
          .maybeSingle()
        if (data) setConsultation(data)

        const { data: msgs } = await supabase
          .from('virtual_consultation_messages')
          .select('*')
          .eq('virtual_consultation_id', data?.id)
          .order('created_at', { ascending: true })
        if (msgs) setMessages(msgs)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    if (roomId) loadConsultation()
  }, [roomId])

  // Subscribe to new messages via realtime
  useEffect(() => {
    if (!consultation?.id) return
    const channel = supabase
      .channel(`vcm-${consultation.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'virtual_consultation_messages', filter: `virtual_consultation_id=eq.${consultation.id}` },
        (payload) => setMessages(prev => [...prev, payload.new])
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [consultation?.id])

  // WebRTC — patient is the responder (waits for doctor's offer)
  const webrtc = useWebRTC({
    roomId,
    isInitiator: false, // Patient waits for the doctor's offer
  })

  // Auto-start when component mounts
  useEffect(() => {
    if (!loading && consultation) {
      webrtc.startCall()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, consultation])

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Call timer
  useEffect(() => {
    if (webrtc.callStatus === 'connected') {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    } else {
      clearInterval(callTimerRef.current)
    }
    return () => clearInterval(callTimerRef.current)
  }, [webrtc.callStatus])

  const handleEndCall = useCallback(async () => {
    webrtc.endCall()
    setCallEnded(true)
    if (consultation) {
      await supabase.from('virtual_consultations').update({
        status: 'completed',
        actual_end: new Date().toISOString(),
        duration_seconds: callDuration,
      }).eq('id', consultation.id)
    }
  }, [webrtc, consultation, callDuration])

  const handleSendMessage = useCallback(async (e) => {
    e?.preventDefault()
    if (!chatInput.trim() || !consultation) return
    try {
      await supabase.from('virtual_consultation_messages').insert({
        virtual_consultation_id: consultation.id,
        sender_type: 'patient',
        message_type: 'text',
        content: chatInput.trim(),
      })
      setChatInput('')
    } catch (err) {
      console.error('Could not send message:', err)
    }
  }, [chatInput, consultation])

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const callStatusColor = {
    idle: 'var(--muted)',
    connecting: 'var(--gold)',
    connected: 'var(--success)',
    ended: 'var(--muted)',
    failed: 'var(--danger)',
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 200 }}>
        Loading consultation…
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Video size={18} style={{ color: 'var(--teal)' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Virtual Consultation with {consultation?.doctor_name || 'Dr.'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: callStatusColor[webrtc.callStatus] }} />
              {webrtc.callStatus === 'connecting' && 'Connecting to doctor…'}
              {webrtc.callStatus === 'connected' && `Connected · ${formatDuration(callDuration)}`}
              {webrtc.callStatus === 'ended' && 'Call ended'}
              {webrtc.callStatus === 'failed' && 'Connection failed'}
              {webrtc.callStatus === 'idle' && 'Starting…'}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 8, border: 'none',
          background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={16} />
        </button>
      </div>

      {/* Error */}
      {webrtc.error && (
        <div style={{
          position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 16px', borderRadius: 8, background: 'rgba(240,79,95,0.9)',
          color: '#fff', fontSize: 12.5, zIndex: 10, maxWidth: 400,
        }}>
          {webrtc.error}
        </div>
      )}

      {/* Video area */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Remote video (doctor) */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {webrtc.remoteStream ? (
            <video
              autoPlay playsInline
              ref={el => { if (el && webrtc.remoteStream && el.srcObject !== webrtc.remoteStream) el.srcObject = webrtc.remoteStream }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {webrtc.callStatus === 'connecting' ? 'Waiting for doctor to join…' : 'No video stream'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                The doctor will appear here when they connect
              </div>
            </div>
          )}
        </div>

        {/* Local video (patient) */}
        <div style={{
          position: 'absolute', bottom: 80, right: showChat ? 340 : 20,
          width: 180, height: 135, borderRadius: 12, overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 5,
        }}>
          {webrtc.localStream ? (
            <video
              autoPlay playsInline muted
              ref={el => { if (el && webrtc.localStream && el.srcObject !== webrtc.localStream) el.srcObject = webrtc.localStream }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
              Camera off
            </div>
          )}
        </div>

        {/* Chat */}
        {showChat && (
          <div style={{ width: 320, background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 10, display: 'flex', justifyContent: m.sender_type === 'patient' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                    background: m.sender_type === 'patient' ? 'var(--teal)' : 'rgba(255,255,255,0.1)',
                    color: m.sender_type === 'patient' ? '#000' : '#fff', fontSize: 12.5, lineHeight: 1.4,
                  }}>
                    {m.content}
                    <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 6, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message…" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12.5, outline: 'none' }} />
              <button type="submit" style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Controls */}
      {!callEnded && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}>
          <button onClick={() => setShowChat(s => !s)} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: showChat ? 'rgba(0,199,199,0.2)' : 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={18} />
          </button>
          <button onClick={webrtc.toggleVideo} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: webrtc.videoEnabled ? 'rgba(255,255,255,0.15)' : 'rgba(240,79,95,0.3)', color: webrtc.videoEnabled ? '#fff' : 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {webrtc.videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
          <button onClick={webrtc.toggleAudio} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: webrtc.audioEnabled ? 'rgba(255,255,255,0.15)' : 'rgba(240,79,95,0.3)', color: webrtc.audioEnabled ? '#fff' : 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {webrtc.audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <button onClick={handleEndCall} style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PhoneOff size={20} />
          </button>
        </div>
      )}

      {/* Call ended message */}
      {callEnded && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Consultation Ended</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              Duration: {formatDuration(callDuration)}
            </div>
            <button onClick={onClose} className="btn btn-primary" style={{ background: 'var(--teal)', color: '#000' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
