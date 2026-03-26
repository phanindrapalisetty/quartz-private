import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessionId } from '../lib/session'

export default function Login() {
  const navigate = useNavigate()

  useEffect(() => {
    if (getSessionId()) navigate('/load', { replace: true })
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm text-center">
        <div className="text-3xl font-bold text-[#0D2E37] mb-1 tracking-tight">Quartz</div>
        <p className="text-gray-400 text-sm mb-8">
          SQL queries over your Google Sheets and files
        </p>

        <a
          href="/auth/login"
          className="flex items-center justify-center gap-3 w-full px-4 py-2.5 bg-[#20A7C9] text-white rounded-lg text-sm font-medium hover:bg-[#1A93B0] active:bg-[#0D2E37] transition-colors"
        >
          {/* <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.1 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.5 29 5.5 24 5.5 13.2 5.5 4.5 14.2 4.5 25S13.2 44.5 24 44.5 43.5 35.8 43.5 25c0-1.6-.2-3.1-.5-4.5z" />
            <path fill="#FF3D00" d="M6.3 15.2l6.6 4.8C14.7 16.1 19 13 24 13c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.5 29 5.5 24 5.5c-7.7 0-14.3 4.4-17.7 10.7z" />
            <path fill="#4CAF50" d="M24 44.5c4.9 0 9.3-1.9 12.7-4.9l-5.9-5c-1.7 1.3-3.9 2-6.3 2.1-5.2 0-9.6-3.5-11.2-8.2L6 33.1C9.3 39.8 16.1 44.5 24 44.5z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l5.9 5c-.4.4 6.1-4.5 6.1-13.5 0-1.6-.2-3.1-.5-4.5z" />
          </svg> */}
          Continue with Google
        </a>

        <p className="text-xs text-gray-400 mt-6 leading-relaxed">
          Your data stays in your session.<br />No service accounts. No shared credentials.
        </p>
      </div>
    </div>
  )
}
