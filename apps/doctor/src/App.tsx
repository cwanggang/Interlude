// Two tabs (Home, Patients) and the patient view inside Patients. No router: the location lives
// in the URL hash (#/home, #/patients, #/patient/<id>) so a refresh keeps it.
import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { NavBar } from './components'
import DoctorHome from './screens/DoctorHome'
import PatientList from './screens/PatientList'
import PatientView from './screens/PatientView'

type Location = { tab: 'home' | 'patients'; patientId?: Id<'patients'> }

function readHash(): Location {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash.startsWith('patient/')) return { tab: 'patients', patientId: hash.slice('patient/'.length) as Id<'patients'> }
  if (hash === 'patients') return { tab: 'patients' }
  return { tab: 'home' }
}

function hrefFor(location: Location): string {
  if (location.patientId) return `#/patient/${location.patientId}`
  return `#/${location.tab}`
}

export default function App() {
  const [location, setLocation] = useState<Location>(readHash)
  const openAlerts = useQuery(api.alerts.listOpen)

  useEffect(() => {
    const onHash = () => setLocation(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: Location) => {
    window.location.hash = hrefFor(next)
    setLocation(next)
  }
  const openPatient = (patientId: Id<'patients'>) => go({ tab: 'patients', patientId })

  return (
    <>
      <NavBar
        tabs={[
          { id: 'home', label: 'Home' },
          { id: 'patients', label: 'Patients', badge: openAlerts?.length },
        ]}
        active={location.tab}
        onSelect={(tab) => go({ tab })}
      />
      {location.patientId ? (
        <PatientView patientId={location.patientId} onBack={() => go({ tab: 'patients' })} />
      ) : location.tab === 'patients' ? (
        <PatientList onSelect={openPatient} />
      ) : (
        <DoctorHome onOpenPatient={openPatient} onSeeAllPatients={() => go({ tab: 'patients' })} />
      )}
    </>
  )
}
