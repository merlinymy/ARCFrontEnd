import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyPalette, getPalette } from './lib/palette'

// Before the first render, not in an effect: applying it after mount would
// show the default palette for a frame and then repaint.
applyPalette(getPalette())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
