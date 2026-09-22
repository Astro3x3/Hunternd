import { Suspense, lazy } from 'react'
import './App.css'

// The 3D bundle is heavy — lazy-load it behind a loading screen.
const Game = lazy(() => import('./Game'))

function App() {
  return (
    <div className="app">
      <Suspense fallback={<LoadingScreen />}>
        <Game />
      </Suspense>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="app__loading">
      <div className="app__spinner" />
      <p>Preparing the hunting grounds…</p>
    </div>
  )
}

export default App
