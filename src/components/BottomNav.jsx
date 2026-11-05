// patient-portal/src/components/BottomNav.jsx
// COMPLETE drop-in replacement (no patching required).
//
// Same as the original BottomNav, but replaces the "Visits" tab with a
// "Plans" tab that links to the new /payment-plans route. Patients who
// need appointments can still access them from the Dashboard home page.
//
// If you want to keep BOTH Visits and Plans, add a 6th item to navItems
// below — most mobile bottom navs handle 5 items cleanly, but 6 starts
// to feel cramped on small screens.

import { NavLink } from 'react-router-dom'
import { Home, FileText, CreditCard, CalendarDays, User } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/results', label: 'Results', icon: FileText },
  { to: '/bills', label: 'Bills', icon: CreditCard },
  { to: '/payment-plans', label: 'Plans', icon: CalendarDays },   // NEW
  { to: '/profile', label: 'Profile', icon: User },
]

export default function BottomNav() {
  return (
    <nav className="safe-bottom bg-white border-t border-surface-200 fixed bottom-0 left-0 right-0 z-30">
      <div className="flex items-center justify-around px-1 py-1.5 max-w-md mx-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all-smooth ${
                isActive ? 'nav-active' : 'nav-inactive'
              }`
            }
          >
            <Icon size={19} strokeWidth={2} />
            <span className="text-[10px] font-semibold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
