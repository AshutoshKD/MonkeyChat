import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Room from './pages/Room'
import './App.css'

function App() {
  return (
    <Router>
      <div className="app">
        <h1>MonkeyChat</h1>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
