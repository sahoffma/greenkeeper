import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FertilizerCapturePage } from '../../src/pages/FertilizerCapturePage'
import '../../src/styles/global.css'

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'find'

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[`/ausruestung/duenger/erfassen?screenshot=${mode}`]}>
    <Routes>
      <Route path="/ausruestung/duenger/erfassen" element={<FertilizerCapturePage />} />
    </Routes>
  </MemoryRouter>,
)
