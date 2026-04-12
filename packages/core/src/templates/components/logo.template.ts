import { logoPngBase64 } from '../../assets/logo'

export interface LogoData {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'white' | 'dark'
  showText?: boolean
  showVersion?: boolean
  version?: string
  className?: string
  href?: string // Optional link URL
}

const imgSizes = {
  sm: '24',
  md: '32',
  lg: '40',
  xl: '48'
}

const fontSizes = {
  sm: '1.125rem',
  md: '1.25rem',
  lg: '1.5rem',
  xl: '2rem'
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

  const imgSize = imgSizes[size]
  const fontSize = fontSizes[size]
  const textColor = variant === 'white' ? '#ffffff' : variant === 'dark' ? '#1f2937' : '#F1F2F2'
  const accentColor = '#f97316' // orange-500

  const mascotImg = `<img src="data:image/png;base64,${logoPngBase64}" alt="ForgeFoxy" width="${imgSize}" height="${imgSize}" style="width: ${imgSize}px; height: ${imgSize}px;" />`

  const textMark = showText ? `
    <span style="font-size: ${fontSize}; font-weight: 700; letter-spacing: -0.025em; line-height: 1;">
      <span style="color: ${textColor}">Forge</span><span style="color: ${accentColor}">Foxy</span>
    </span>
  ` : ''

  const versionBadge = showVersion && version ? `
    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
      variant === 'white'
        ? 'bg-white/10 text-white/80 ring-white/20'
        : 'bg-orange-50 text-orange-700 ring-orange-700/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20'
    }">
      ${version}
    </span>
  ` : ''

  const logoContent = `
    <div class="flex items-center gap-2 ${className}">
      ${mascotImg}
      ${textMark}
      ${versionBadge}
    </div>
  `

  if (href) {
    return `<a href="${href}" class="inline-block hover:opacity-80 transition-opacity">${logoContent}</a>`
  }

  return logoContent
}
