import { ConversationSection } from '../components/home/ConversationSection'
import { HeroSection } from '../components/home/HeroSection'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { LawnCarouselSection } from '../components/home/LawnCarouselSection'
import { dummyLawnAreas } from '../data/homeDummyData'
import styles from './HomeScreen.module.css'

export function HomeScreen() {
  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <HeroSection />
        <ConversationSection />
        <div className={styles.lawnSpacing}>
          <LawnCarouselSection lawnAreas={dummyLawnAreas} />
        </div>
      </main>
    </HomeAppShell>
  )
}
