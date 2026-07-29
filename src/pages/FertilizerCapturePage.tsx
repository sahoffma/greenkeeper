import { HomeAppShell } from '../components/home/HomeAppShell'
import { FertilizerCaptureFlow } from '../components/fertilizer/FertilizerCaptureFlow'
import styles from './FertilizerCategoryPage.module.css'

export function FertilizerCapturePage() {
  return (
    <HomeAppShell>
      <main className={`${styles.screen} ${styles.captureScreen}`}>
        <FertilizerCaptureFlow />
      </main>
    </HomeAppShell>
  )
}
