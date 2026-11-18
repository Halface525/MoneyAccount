interface P {
  size?: number
  strokeWidth?: number
  className?: string
}

const base = (size = 22, sw = 1.7) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: sw,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconHome = ({ size, strokeWidth, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M3.5 10.5 12 3.8l8.5 6.7" />
    <path d="M5.5 9.5V19a1 1 0 0 0 1 1H9.5v-4.6a2.5 2.5 0 0 1 5 0V20h3a1 1 0 0 0 1-1V9.5" />
  </svg>
)

export const IconList = ({ size, strokeWidth, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M8 6.5h12M8 12h12M8 17.5h12" />
    <circle cx="4.2" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="4.2" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="4.2" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)

export const IconChart = ({ size, strokeWidth, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M4 20V10.5M10 20V4.8M16 20v-6.6M22 20H2.5" />
  </svg>
)

export const IconWallet = ({ size, strokeWidth, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="2.8" y="6" width="18.4" height="13.2" rx="3.2" />
    <path d="M2.8 10.2h18.4" />
    <circle cx="17.2" cy="14.6" r="1.15" fill="currentColor" stroke="none" />
  </svg>
)

export const IconGear = ({ size, strokeWidth, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46V20a1.94 1.94 0 1 1-3.88 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H4a1.94 1.94 0 1 1 0-3.88h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32H9.9a1.6 1.6 0 0 0 .97-1.46V4a1.94 1.94 0 1 1 3.88 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97H20a1.94 1.94 0 1 1 0 3.88h-.1a1.6 1.6 0 0 0-1.46.97Z" />
  </svg>
)

export const IconPlus = ({ size = 26, strokeWidth = 2.1, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconChevronLeft = ({ size = 20, strokeWidth = 2, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
)

export const IconChevronRight = ({ size = 18, strokeWidth = 2, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </svg>
)

export const IconClose = ({ size = 20, strokeWidth = 2, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconSearch = ({ size = 17, strokeWidth = 1.9, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.4 15.4 20 20" />
  </svg>
)

export const IconTrash = ({ size = 18, strokeWidth = 1.8, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M4 6.5h16M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.3 6.5l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h6.6a1.6 1.6 0 0 0 1.6-1.5l.8-12.2" />
    <path d="M10.3 10.5v6M13.7 10.5v6" />
  </svg>
)

export const IconCheck = ({ size = 18, strokeWidth = 2.2, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </svg>
)

export const IconCalendar = ({ size = 16, strokeWidth = 1.8, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="3.4" y="5.2" width="17.2" height="15" rx="3" />
    <path d="M3.4 9.8h17.2M8.2 3.2v3.6M15.8 3.2v3.6" />
  </svg>
)

export const IconArrowUp = ({ size = 12, strokeWidth = 2.4, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
)

export const IconArrowDown = ({ size = 12, strokeWidth = 2.4, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
)

export const IconRepeat = ({ size = 13, strokeWidth = 2, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M17 2.5l3 3-3 3" />
    <path d="M20 5.5H8a4.5 4.5 0 0 0-4.5 4.5v1" />
    <path d="M7 21.5l-3-3 3-3" />
    <path d="M4 18.5h12a4.5 4.5 0 0 0 4.5-4.5v-1" />
  </svg>
)

export const IconEdit = ({ size = 17, strokeWidth = 1.8, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M15.5 4.5 19.5 8.5 8 20H4v-4z" />
  </svg>
)

export const IconDownload = ({ size = 17, strokeWidth = 1.8, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17.5v1.8a1.7 1.7 0 0 0 1.7 1.7h12.6a1.7 1.7 0 0 0 1.7-1.7v-1.8" />
  </svg>
)

export const IconUpload = ({ size = 17, strokeWidth = 1.8, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 17.5v1.8a1.7 1.7 0 0 0 1.7 1.7h12.6a1.7 1.7 0 0 0 1.7-1.7v-1.8" />
  </svg>
)

export const IconTransfer = ({ size = 18, strokeWidth = 1.9, className }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M4 8h13M14 5l3 3-3 3" />
    <path d="M20 16H7M10 13l-3 3 3 3" />
  </svg>
)
