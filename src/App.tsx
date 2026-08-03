import { Navigate, Routes, Route, useParams } from 'react-router-dom'
import { resolveLegacyApplicationRedirectPath } from './lib/fertilizerRoutes'
import { AuthRecoveryRedirect } from './components/AuthRecoveryRedirect'
import { FertilizerCaptureRouteLifecycle } from './components/fertilizer/FertilizerCaptureRouteLifecycle'
import { EmailConfirmationRoute } from './components/EmailConfirmationRoute'
import { GuestRoute } from './components/GuestRoute'
import { OnboardingRoute } from './components/OnboardingRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ResetPasswordRoute } from './components/ResetPasswordRoute'
import { AreaShell } from './components/AreaShell'
import { AreasPage } from './pages/AreasPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmailConfirmPage } from './pages/EmailConfirmPage'
import { EquipmentPage } from './pages/EquipmentPage'
import { EquipmentCategoryPage } from './pages/EquipmentCategoryPage'
import { FertilizerCapturePage } from './pages/FertilizerCapturePage'
import { FertilizerStockIntakePage } from './pages/FertilizerStockIntakePage'
import { FertilizerStockOutboundPage } from './pages/FertilizerStockOutboundPage'
import { FertilizerApplicationPage } from './pages/FertilizerApplicationPage'
import { FertilizerCategoryPage } from './pages/FertilizerCategoryPage'
import { FertilizerProductDetailPage } from './pages/FertilizerProductDetailPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { JournalPage } from './pages/JournalPage'
import { GreenkeeperPage } from './pages/GreenkeeperPage'
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
import { ProductRecognizeSpikePage } from './pages/dev/ProductRecognizeSpikePage'

function LegacyFertilizerApplicationRedirect() {
  const { inventoryItemId } = useParams<{ inventoryItemId: string }>()
  return <Navigate to={resolveLegacyApplicationRedirectPath(inventoryItemId)} replace />
}

export default function App() {
  return (
    <>
      <AuthRecoveryRedirect />
      <FertilizerCaptureRouteLifecycle />
      <Routes>
      <Route path="/" element={<RootPage />} />
      <Route path="/dev/product-recognize" element={<ProductRecognizeSpikePage />} />
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
        path="/greenkeeper"
        element={
          <ProtectedRoute>
            <GreenkeeperPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung"
        element={
          <ProtectedRoute>
            <EquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/duenger"
        element={
          <ProtectedRoute>
            <FertilizerCategoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/duengung"
        element={
          <ProtectedRoute>
            <FertilizerApplicationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/duengung/:inventoryItemId"
        element={
          <ProtectedRoute>
            <FertilizerApplicationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/duenger/:inventoryItemId/anwenden"
        element={
          <ProtectedRoute>
            <LegacyFertilizerApplicationRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/duenger/erfassen"
        element={
          <ProtectedRoute>
            <FertilizerCapturePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/duenger/:inventoryItemId/zugang"
        element={
          <ProtectedRoute>
            <FertilizerStockIntakePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/duenger/:inventoryItemId/abgang"
        element={
          <ProtectedRoute>
            <FertilizerStockOutboundPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/duenger/bestand"
        element={<Navigate to="/ausruestung/duenger" replace />}
      />
      <Route
        path="/ausruestung/duenger/katalog"
        element={<Navigate to="/ausruestung/duenger" replace />}
      />
      <Route
        path="/ausruestung/duenger/:productId"
        element={
          <ProtectedRoute>
            <FertilizerProductDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ausruestung/:categorySlug"
        element={
          <ProtectedRoute>
            <EquipmentCategoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/garten"
        element={
          <ProtectedRoute>
            <Navigate to="/ausruestung" replace />
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
