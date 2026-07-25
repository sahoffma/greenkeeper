import { Routes, Route } from 'react-router-dom'
import { OnboardingRoute } from './components/OnboardingRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AreaShell } from './components/AreaShell'
import { AreasPage } from './pages/AreasPage'
import { DashboardPage } from './pages/DashboardPage'
import { GardenPage } from './pages/GardenPage'
import { HomeScreen } from './pages/HomeScreen'
import { JournalPage } from './pages/JournalPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingLawnAreasPage } from './pages/onboarding/OnboardingLawnAreasPage'
import { OnboardingMultipleCountPage } from './pages/onboarding/OnboardingMultipleCountPage'
import { OnboardingMultipleCarePage } from './pages/onboarding/OnboardingMultipleCarePage'
import { OnboardingStep3Page } from './pages/onboarding/OnboardingStep3Page'
import { OnboardingStep4PlaceholderPage } from './pages/onboarding/OnboardingStep4PlaceholderPage'
import { OnboardingWelcomePage } from './pages/onboarding/OnboardingWelcomePage'
import { MorePage } from './pages/MorePage'
import { ProductAssistantPage } from './pages/ProductAssistantPage'
import { TimelinePage } from './pages/TimelinePage'
import { NewActivityPage } from './pages/NewActivityPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <OnboardingRoute>
            <OnboardingWelcomePage />
          </OnboardingRoute>
        }
      />
      <Route
        path="/onboarding/2"
        element={
          <OnboardingRoute>
            <OnboardingLawnAreasPage />
          </OnboardingRoute>
        }
      />
      <Route
        path="/onboarding/2/care"
        element={
          <OnboardingRoute>
            <OnboardingMultipleCarePage />
          </OnboardingRoute>
        }
      />
      <Route
        path="/onboarding/2/count"
        element={
          <OnboardingRoute>
            <OnboardingMultipleCountPage />
          </OnboardingRoute>
        }
      />
      <Route
        path="/onboarding/3"
        element={
          <OnboardingRoute>
            <OnboardingStep3Page />
          </OnboardingRoute>
        }
      />
      <Route
        path="/onboarding/4"
        element={
          <OnboardingRoute>
            <OnboardingStep4PlaceholderPage />
          </OnboardingRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/journal"
        element={
          <ProtectedRoute>
            <JournalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/garten"
        element={
          <ProtectedRoute>
            <GardenPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/areas"
        element={
          <ProtectedRoute>
            <AreasPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/area/:areaId"
        element={
          <ProtectedRoute>
            <AreaShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="new" element={<NewActivityPage />} />
        <Route path="edit/:activityId" element={<NewActivityPage />} />
        <Route path="assistant" element={<ProductAssistantPage />} />
        <Route path="more" element={<MorePage />} />
      </Route>
    </Routes>
  )
}
