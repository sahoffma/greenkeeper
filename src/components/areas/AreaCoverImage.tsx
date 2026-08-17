import type { CSSProperties, ReactNode } from 'react'
import {
  coverImageObjectFit,
  coverImageObjectPosition,
} from '../../lib/areaCover'
import type { AreaCoverImageSource, AreaCoverPlaceholderVariant } from '../../types/areaCover'
import styles from './areaCover.module.css'

interface AreaCoverImageProps {
  cover: AreaCoverImageSource
  placeholderVariant?: AreaCoverPlaceholderVariant
  className?: string
  children?: ReactNode
}

export function AreaCoverImage({
  cover,
  placeholderVariant = 'main',
  className,
  children,
}: AreaCoverImageProps) {
  const imageStyle: CSSProperties = {
    objectFit: coverImageObjectFit(cover.crop),
    objectPosition: coverImageObjectPosition(cover.crop),
  }

  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')}>
      {cover.url ? (
        <img src={cover.url} alt="" className={styles.image} style={imageStyle} />
      ) : (
        <div
          className={`${styles.placeholder} ${styles[`placeholder--${placeholderVariant}`]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  )
}

interface AreaCoverLabelsProps {
  name: string
  detail: string
  compact?: boolean
  large?: boolean
}

export function AreaCoverLabels({ name, detail, compact = false, large = false }: AreaCoverLabelsProps) {
  return (
    <div className={`${styles.overlay} ${compact ? styles.overlayCompact : ''}`.trim()}>
      <div className={styles.meta}>
        <h2 className={`${styles.name} ${large ? styles.nameLarge : ''}`.trim()}>{name}</h2>
        <p className={`${styles.detail} ${large ? styles.detailLarge : ''}`.trim()}>{detail}</p>
      </div>
    </div>
  )
}
