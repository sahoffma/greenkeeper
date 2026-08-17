import { getCareGroupAccentIndex, getCareGroupDisplayNumber } from '../../lib/careGroupsCore'
import { LinkIcon } from '../icons/LinkIcon'
import styles from './AreaGroupIndicator.module.css'

interface AreaGroupIndicatorProps {
  groupId: string
  allGroupIds: string[]
}

export function AreaGroupIndicator({ groupId, allGroupIds }: AreaGroupIndicatorProps) {
  const accentIndex = getCareGroupAccentIndex(groupId, allGroupIds)
  const displayNumber = getCareGroupDisplayNumber(groupId, allGroupIds)
  const hasMultipleGroups = allGroupIds.length > 1

  const ariaLabel =
    displayNumber != null
      ? `Diese Rasenfläche wird gemeinsam mit anderen Flächen betrachtet. Gruppe ${displayNumber}.`
      : 'Diese Rasenfläche wird gemeinsam mit anderen Flächen betrachtet.'

  return (
    <span
      className={`${styles.indicator} ${hasMultipleGroups ? styles.indicatorNumbered : ''} ${styles[`accent${accentIndex % 4}`]}`}
      aria-label={ariaLabel}
    >
      <span className={styles.icon} aria-hidden="true">
        <LinkIcon />
      </span>
      {displayNumber != null && (
        <span className={styles.number} aria-hidden="true">
          {displayNumber}
        </span>
      )}
    </span>
  )
}

export function shouldShowAreaGroupIndicator(
  areaId: string,
  memberships: Array<{ careGroupId: string; areaId: string }>,
  getGroupId: (areaId: string, memberships: Array<{ careGroupId: string; areaId: string }>) => string | null,
): boolean {
  return getGroupId(areaId, memberships) != null
}
