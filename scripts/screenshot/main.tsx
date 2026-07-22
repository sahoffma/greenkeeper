import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HomeScreen } from '../../src/pages/HomeScreen'
import '../../src/styles/global.css'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <HomeScreen />
  </BrowserRouter>,
)
