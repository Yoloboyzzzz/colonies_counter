import { useState } from 'react'
import DetectTab from './components/DetectTab'
import TrainTab from './components/TrainTab'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState('detect')

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Colony Counter</h1>
          <p className="subtitle">YOLOv8-powered bacterial colony detection</p>
        </div>
        <nav className="tabs">
          <button
            className={`tab-btn ${activeTab === 'detect' ? 'active' : ''}`}
            onClick={() => setActiveTab('detect')}
          >
            🔬 Detect Colonies
          </button>
          <button
            className={`tab-btn ${activeTab === 'train' ? 'active' : ''}`}
            onClick={() => setActiveTab('train')}
          >
            🧠 Train Model
          </button>
        </nav>
      </header>

      <main className="main">
        {activeTab === 'detect' ? <DetectTab /> : <TrainTab />}
      </main>
    </div>
  )
}
