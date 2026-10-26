// /emma: a guide to San Francisco for a friend's visit. Its own entry, separate from the main app.
import { useEffect, useState } from 'react'
import { loadWorld, type World } from './world'
import { Scene } from './scene/Scene'

export default function App() {
  const [world, setWorld] = useState<World | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadWorld().then(setWorld).catch((e) => setError(String(e)))
  }, [])

  return (
    <main className="emma">
      {world ? (
        <Scene world={world} />
      ) : (
        <div className="emma-loading">{error ? `Could not load the map: ${error}` : 'Unfolding the city…'}</div>
      )}
    </main>
  )
}
