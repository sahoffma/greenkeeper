import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { FertilizerCategoryPage } from '../../src/pages/FertilizerCategoryPage'
import '../../src/styles/global.css'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <FertilizerCategoryPage />
  </BrowserRouter>,
)
