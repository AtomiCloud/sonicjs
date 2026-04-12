export interface LogoData {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'white' | 'dark'
  showText?: boolean
  showVersion?: boolean
  version?: string
  className?: string
  href?: string // Optional link URL
}

const fontSizes = {
  sm: '1.25rem',
  md: '1.5rem',
  lg: '2rem',
  xl: '2.5rem'
}

const sizeClasses = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-12',
  xl: 'h-16'
}


export function renderLogo(data: LogoData = {}): string {
  const {
    size = 'md',
    variant = 'default',
    showText = true,
    showVersion = true,
    version,
    className = '',
    href
  } = data

  const fontSize = fontSizes[size]
  const sizeClass = sizeClasses[size]
  const textColor = variant === 'white' ? '#ffffff' : variant === 'dark' ? '#1f2937' : '#F1F2F2'
  const accentColor = '#f97316' // orange-500

  // ForgeFoxy text wordmark
  const logoSvg = `
    <span class="${sizeClass} ${className}" style="font-size: ${fontSize}; font-weight: 700; letter-spacing: -0.025em; line-height: 1; display: inline-flex; align-items: center;" aria-label="ForgeFoxy">
      <span style="color: ${textColor}">Forge</span><span style="color: ${accentColor}">Foxy</span>
    </span>
  `

  const versionBadge = showVersion && version ? `
    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
      variant === 'white'
        ? 'bg-white/10 text-white/80 ring-white/20'
        : 'bg-orange-50 text-orange-700 ring-orange-700/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20'
    }">
      ${version}
    </span>
  ` : ''

  const logoContent = showText ? `
    <div class="flex items-center gap-2 ${className}">
      ${logoSvg}
      ${versionBadge}
    </div>
  ` : logoSvg

  // Wrap in link if href is provided
  if (href) {
    return `<a href="${href}" class="inline-block hover:opacity-80 transition-opacity">${logoContent}</a>`
  }

  return logoContent
}
