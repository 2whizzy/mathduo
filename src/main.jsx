import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx' // Import Tailwind CSS styles
import UseSoundEngine from './App.jsx' // Ensure sound engine is initialized

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UseSoundEngine />
  </StrictMode>,
)
