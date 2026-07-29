import type { ReactElement } from 'react'
import type { EquipmentCategoryId } from '../../lib/equipmentCategoriesCore'

interface EquipmentCategoryIconProps {
  categoryId: EquipmentCategoryId
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 21c-4.5-3.2-7-7.1-7-11.5C5 5.6 8.1 3 12 3s7 2.6 7 6.5c0 4.4-2.5 8.3-7 11.5Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M12 21c-4.5-3.2-7-7.1-7-11.5C5 5.6 8.1 3 12 3s7 2.6 7 6.5c0 4.4-2.5 8.3-7 11.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 21V8.5M12 8.5C9.8 8.5 8 6.8 8 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function StackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M4.5 9.5 12 5.5l7.5 4-7.5 4-7.5-4Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M4.5 9.5 12 5.5l7.5 4-7.5 4-7.5-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 14.5 12 18.5l7.5-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 10v8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function SeedlingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 20V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M8.5 20h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 10c0-4 6-4.5 6-8.5-4 .5-6 4.5-6 8.5Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M12 10c0-4 6-4.5 6-8.5-4 .5-6 4.5-6 8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 13c0-2.8-4-3.2-4-6 2.7.4 4 3.2 4 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WaterDropIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 4.2c3.6 5.6 6.2 9.4 6.2 12.8a6.2 6.2 0 1 1-12.4 0C5.8 13.6 8.4 9.8 12 4.2Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M12 4.2c3.6 5.6 6.2 9.4 6.2 12.8a6.2 6.2 0 1 1-12.4 0C5.8 13.6 8.4 9.8 12 4.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 13.5c1.6 0 2.8 1.1 2.8 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CareShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 4c2.1 0 4.9 1.2 6.4 3.6V12c0 3.9-2.7 6.6-6.4 8.2-3.7-1.6-6.4-4.3-6.4-8.2V7.6C7.1 5.2 9.9 4 12 4Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M12 4c2.1 0 4.9 1.2 6.4 3.6V12c0 3.9-2.7 6.6-6.4 8.2-3.7-1.6-6.4-4.3-6.4-8.2V7.6C7.1 5.2 9.9 4 12 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 15.8V11.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 11.2c-1.8 0-3.2-1.3-3.2-2.9 1.8.2 3.2 1.4 3.2 2.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 11.2c1.8 0 3.2-1.3 3.2-2.9-1.8.2-3.2 1.4-3.2 2.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Greenkeeper — offener Maulschlüssel, organisch-anlehnend an die übrigen Kategorie-Icons */
function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M5.5 18.5c2.6-2.3 5-4.4 7.2-6.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12.7 12.3 15.8 9.2 19.5 9.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.7 12.3 15.8 15.4 19.5 15.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const ICONS: Record<EquipmentCategoryId, () => ReactElement> = {
  duenger: LeafIcon,
  'boden-hilfsstoffe': StackIcon,
  saatgut: SeedlingIcon,
  pflanzenschutz: CareShieldIcon,
  bewaesserung: WaterDropIcon,
  geraete: WrenchIcon,
}

export function EquipmentCategoryIcon({ categoryId }: EquipmentCategoryIconProps) {
  const Icon = ICONS[categoryId]
  return <Icon />
}
