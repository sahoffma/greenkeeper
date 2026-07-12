import { Routes, Route } from 'react-router-dom'
import { AreasPage } from './pages/AreasPage'
import { AreaShell } from './components/AreaShell'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AreasPage />} />
      <Route path="/area/:areaId" element={<AreaShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="timeline" element={<PlaceholderPage title="Timeline" />} />
        <Route path="assistant" element={<PlaceholderPage title="Assistent" />} />
        <Route path="more" element={<PlaceholderPage title="Mehr" />} />
      </Route>
    </Routes>
  )
}
