// Placeholder screen proving the Convex wiring. Track B replaces it.
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export default function App() {
  const patients = useQuery(api.patients.list)
  return (
    <main>
      <h1>Patients</h1>
      {patients === undefined ? <p>Loading…</p> : <p>{patients.length} patients</p>}
    </main>
  )
}
