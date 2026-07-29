interface CameraIconProps {
  className?: string
}

export function CameraIcon({ className }: CameraIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M7.5 8.25h2.2l1-1.75h2.6l1 1.75H17a2.25 2.25 0 0 1 2.25 2.25v7A2.25 2.25 0 0 1 17 19.75H7.5A2.25 2.25 0 0 1 5.25 17.5v-7A2.25 2.25 0 0 1 7.5 8.25Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12.25" cy="13.25" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
