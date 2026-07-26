import { Routes, Route } from 'react-router-dom'
import { AuthRecoveryRedirect } from './components/AuthRecoveryRedirect'
import { EmailConfirmationRoute } from './components/EmailConfirmationRoute'
import { GuestRoute } from './components/GuestRoute'
import { OnboardingRoute } from './components/OnboardingRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ResetPasswordRoute } from './components/ResetPasswordRoute'
import { AreaShell } from './components/AreaShell'
import { AreasPage } from './pages/AreasPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmailConfirmPage } from './pages/EmailConfirmPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { GardenPage } from './pages/GardenPage'
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
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { RootPage } from './pages/RootPage'
import { TimelinePage } from './pages/TimelinePage'
import { NewActivityPage } from './pages/NewActivityPage'

export default function App() {
  return (
    <>
      <AuthRecoveryRedirect />
      <Routes>
      <Route path="/" element={<RootPage />} />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        path="/email-bestaetigen"
        element={
          <EmailConfirmationRoute>
            <EmailConfirmPage />
          </EmailConfirmationRoute>
        }
      />
      <Route
        path="/passwort-vergessen"
        element={
          <GuestRoute>
            <ForgotPasswordPage />
          </GuestRoute>
        }
      />
      <Route
        path="/passwort-zuruecksetzen"
        element={
          <ResetPasswordRoute>
            <ResetPasswordPage />
          </ResetPasswordRoute>
        }
      />
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
    </>
  )
}
