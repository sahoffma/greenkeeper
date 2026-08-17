import { Link } from 'react-router-dom'
import { getHomeAreaSizeDetail } from '../../lib/areaSizeDisplay'
import type { Area } from '../../types/area'
import type { CareGroupMembershipRow } from '../../types/careGroup'
import { buildAreaDetailPath } from '../../lib/areaDetail'
import { resolveAreaCoverImage } from '../../lib/areaCover'
import {
  buildCareGroupSummaries,
  getCareGroupIdForArea,
} from '../../lib/careGroupsCore'
import { AreaCoverImage, AreaCoverLabels } from '../areas/AreaCoverImage'
import { AreaGroupIndicator } from './AreaGroupIndicator'
import styles from './HomeAreaSelector.module.css'

interface HomeAreaSelectorProps {
  areas: Area[]
  memberships: CareGroupMembershipRow[]
}

function getImageVariant(index: number): 'main' | 'side' {
  return index % 2 === 0 ? 'main' : 'side'
}

function getGridClassName(count: number): string {
  if (count <= 1) {
    return styles.gridSingle
  }

  if (count === 2) {
    return styles.gridPair
  }

  if (count <= 4) {
    return styles.gridQuad
  }

  return styles.gridMulti
}

function getSectionClassName(count: number): string {
  if (count === 2) {
    return styles.sectionPair
  }

  return ''
}

export function HomeAreaSelector({ areas, memberships }: HomeAreaSelectorProps) {
  if (areas.length === 0) {
    return null
  }

  const isSingle = areas.length === 1
  const groupIds = buildCareGroupSummaries(memberships).map((group) => group.id)

  return (
    <section
      className={`${styles.section} ${getSectionClassName(areas.length)}`.trim()}
      aria-label="Rasenflächen"
    >
      <div className={`${styles.grid} ${getGridClassName(areas.length)}`} role="list">
        {areas.map((area, index) => {
          const cover = resolveAreaCoverImage(area)
          const careGroupId = getCareGroupIdForArea(area.id, memberships)
          const sizeDetail = getHomeAreaSizeDetail(area)

          return (
            <Link
              key={area.id}
              to={buildAreaDetailPath(area.id)}
              state={{ from: 'home' }}
              role="listitem"
              className={styles.card}
              aria-label={`${area.name}${sizeDetail ? `, ${sizeDetail}` : ''}, Details anzeigen`}
            >
              <AreaCoverImage cover={cover} placeholderVariant={getImageVariant(index)} className={styles.cover}>
                <AreaCoverLabels
                  name={area.name}
                  detail={sizeDetail}
                  large={isSingle}
                />
              </AreaCoverImage>

              {careGroupId && (
                <AreaGroupIndicator groupId={careGroupId} allGroupIds={groupIds} />
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
