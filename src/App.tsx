import { useEffect, useState } from 'react'
import { loadWorld, type World } from './lib/world'
import { Scene } from './scene/Scene'
import { Header } from './ui/Header'
import { QuestPanel } from './ui/QuestPanel'
import { Layers } from './ui/Layers'
import { DetailCard } from './ui/DetailCard'
import { Hint } from './ui/Hint'
import { DeepLink } from './ui/DeepLink'

export default function App() {
  const [world, setWorld] = useState<World | null>(null)
  const [stage, setStage] = useState('map')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadWorld(setStage).then(setWorld).catch((e) => setError(String(e)))
  }, [])

  return (
    <div className="app">
      {world ? <Scene world={world} /> : <Loading stage={stage} error={error} />}
      <Header />
      {world && (
        <>
          <QuestPanel />
          <Layers />
          <DetailCard />
          <Hint />
          <DeepLink />
        </>
      )}
    </div>
  )
}

function Loading({ stage, error }: { stage: string; error: string | null }) {
  return (
    <div className="loading">
      <div className="loading__box">
        <div className="loading__title">Explore Bay Area</div>
        <div className="loading__stage">{error ? `Could not load data: ${error}` : `Unfolding the ${stage}…`}</div>
        {error && <div className="loading__hint">Run <code>pnpm data</code> to generate public/data first.</div>}
      </div>
    </div>
  )
}
