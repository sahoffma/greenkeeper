import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { deleteMeasureActivity } from '../lib/activityCreate'
import { fetchTimelineActivities } from '../lib/activities'
import { getErrorMessage } from '../lib/errors'
import type { AreaOutletContext } from '../types/area'
import type { TimelineActivity } from '../types/activity'
import styles from './TimelinePage.module.css'

export function TimelinePage() {
  const { areaId = '' } = useParams()
  const navigate = useNavigate()
  const { refreshArea } = useOutletContext<AreaOutletContext>()
  const [activities, setActivities] = useState<TimelineActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TimelineActivity | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadActivities = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchTimelineActivities(areaId)
      setActivities(data)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Aktivitäten konnten nicht geladen werden.'))
    } finally {
      setLoading(false)
    }
  }, [areaId])

  useEffect(() => {
    void loadActivities()
  }, [loadActivities])

  useEffect(() => {
    if (!openMenuId) {
      return
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target

      if (!(target instanceof Node) || !menuRef.current?.contains(target)) {
        setOpenMenuId(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuId])

  function handleEdit(activityId: string) {
    setOpenMenuId(null)
    navigate(`/area/${areaId}/edit/${activityId}`)
  }

  function handleDeleteRequest(activity: TimelineActivity) {
    setOpenMenuId(null)
    setDeleteError(null)
    setDeleteTarget(activity)
  }

  function handleDeleteCancel() {
    if (deleting) {
      return
    }

    setDeleteTarget(null)
    setDeleteError(null)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteMeasureActivity(deleteTarget.id, areaId)
      await refreshArea()
      await loadActivities()
      setDeleteTarget(null)
    } catch (confirmError) {
      setDeleteError(getErrorMessage(confirmError, 'Die Maßnahme konnte nicht gelöscht werden.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={styles.timeline}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Timeline</p>
        <h1 className={styles.title}>Aktivitäten</h1>
      </header>

      {loading && (
        <p className={styles.statusMessage}>Aktivitäten werden geladen …</p>
      )}

      {error && (
        <div className={`surface-card ${styles.statusCard}`}>
          <p className={styles.statusMessage}>{error}</p>
        </div>
      )}

      {!loading && !error && activities.length === 0 && (
        <div className={`surface-card ${styles.emptyCard}`}>
          <p className={styles.emptyTitle}>Noch keine Aktivitäten</p>
          <p className={styles.emptyText}>
            Sobald du eine Maßnahme erfasst, erscheint sie hier in der Timeline.
          </p>
        </div>
      )}

      {!loading && !error && activities.length > 0 && (
        <ol className={styles.list}>
          {activities.map((activity) => (
            <li key={activity.id} className={`surface-card ${styles.item}`}>
              <div className={styles.itemHeader}>
                <time className={styles.date} dateTime={activity.occurredAt}>
                  {activity.date}
                </time>

                <div className={styles.headerActions}>
                  <span className={styles.typeLabel}>{activity.typeLabel}</span>

                  <div
                    className={styles.menuWrap}
                    ref={openMenuId === activity.id ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      className={styles.menuButton}
                      aria-label="Aktionen"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === activity.id}
                      onClick={() =>
                        setOpenMenuId((current) =>
                          current === activity.id ? null : activity.id,
                        )
                      }
                    >
                      ⋯
                    </button>

                    {openMenuId === activity.id && (
                      <div className={styles.menu} role="menu">
                        <button
                          type="button"
                          className={styles.menuItem}
                          role="menuitem"
                          onClick={() => handleEdit(activity.id)}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className={`${styles.menuItem} ${styles.menuItemDanger}`}
                          role="menuitem"
                          onClick={() => handleDeleteRequest(activity)}
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <h2 className={styles.itemTitle}>{activity.title}</h2>

              {activity.productName && (
                <p className={styles.product}>
                  <span className={styles.metaLabel}>Produkt</span>
                  {activity.productName}
                </p>
              )}

              {activity.mowHeightMm != null && (
                <p className={styles.product}>
                  <span className={styles.metaLabel}>Schnitthöhe</span>
                  {activity.mowHeightMm} mm
                </p>
              )}

              {activity.amountApplied != null && activity.amountUnit && (
                <p className={styles.product}>
                  <span className={styles.metaLabel}>Menge</span>
                  {activity.amountApplied} {activity.amountUnit}
                </p>
              )}

              {activity.notes && (
                <p className={styles.notes}>{activity.notes}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {deleteTarget && (
        <div
          className={styles.dialogOverlay}
          role="presentation"
          onClick={handleDeleteCancel}
        >
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-dialog-title" className={styles.dialogTitle}>
              Maßnahme löschen?
            </h2>
            <p id="delete-dialog-description" className={styles.dialogText}>
              Möchtest du die Maßnahme{' '}
              <strong>{deleteTarget.title}</strong> vom <strong>{deleteTarget.date}</strong>{' '}
              wirklich löschen?
            </p>

            {deleteError && <p className={styles.dialogError}>{deleteError}</p>}

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.dialogDelete}
                disabled={deleting}
                onClick={() => {
                  void handleDeleteConfirm()
                }}
              >
                {deleting ? 'Wird gelöscht …' : 'Löschen'}
              </button>
              <button
                type="button"
                className={styles.dialogCancel}
                disabled={deleting}
                onClick={handleDeleteCancel}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
