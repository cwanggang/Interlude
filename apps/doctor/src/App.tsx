// Two screens, no router: the patient list and one patient's view. The selection lives in the
// URL hash so a refresh keeps the open patient.
import { useEffect, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import PatientList from './screens/PatientList'
import PatientView from './screens/PatientView'

function readHash(): Id<'patients'> | null {
  const id = window.location.hash.replace(/^#\/?patient\//, '')
  return id && id !== window.location.hash ? (id as Id<'patients'>) : null
}

export default function App() {
  const [patientId, setPatientId] = useState<Id<'patients'> | null>(readHash)

  useEffect(() => {
    const onHash = () => setPatientId(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = (id: Id<'patients'> | null) => {
    window.location.hash = id ? `/patient/${id}` : ''
    setPatientId(id)
  }

  return patientId ? <PatientView patientId={patientId} onBack={() => open(null)} /> : <PatientList onSelect={open} />
}
