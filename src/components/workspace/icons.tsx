import type { ReactNode, SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

function Icon({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconMark(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" strokeWidth={1.4} />
      <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="7.2" r="1.15" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.6" cy="10.6" r="6.1" />
      <path d="M15.1 15.1 19.8 19.8" />
    </Icon>
  )
}

export function IconSliders(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.8 8.4h9.4M17.8 8.4h2.4M3.8 15.6h4.4M12.8 15.6h7.4" />
      <circle cx="15.5" cy="8.4" r="2.3" />
      <circle cx="10.5" cy="15.6" r="2.3" />
    </Icon>
  )
}

export function IconSparkle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.4 4.4c.66 3.5 2.2 5.04 5.7 5.7-3.5.66-5.04 2.2-5.7 5.7-.66-3.5-2.2-5.04-5.7-5.7 3.5-.66 5.04-2.2 5.7-5.7Z" />
      <path d="M17.6 15.2c.34 1.7 1.08 2.44 2.78 2.78-1.7.34-2.44 1.08-2.78 2.78-.34-1.7-1.08-2.44-2.78-2.78 1.7-.34 2.44-1.08 2.78-2.78Z" />
    </Icon>
  )
}

export function IconFolder({ open = false, ...props }: IconProps & { open?: boolean }) {
  if (open) {
    return (
      <Icon {...props}>
        <path d="M3.6 8.1A1.7 1.7 0 0 1 5.3 6.4h3.6l1.7 2.1h6.1a1.7 1.7 0 0 1 1.66 1.32l1.2 6.5a1.7 1.7 0 0 1-1.67 2.02H5.9a1.7 1.7 0 0 1-1.68-1.43Z" />
        <path d="M3.6 8.1v9" />
      </Icon>
    )
  }
  return (
    <Icon {...props}>
      <path d="M3.6 7.3A1.7 1.7 0 0 1 5.3 5.6h3.6l1.7 2.1h7.1a1.7 1.7 0 0 1 1.7 1.7v7.9a1.7 1.7 0 0 1-1.7 1.7H5.3a1.7 1.7 0 0 1-1.7-1.7Z" />
    </Icon>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5.8v12.4M5.8 12h12.4" />
    </Icon>
  )
}

export function IconBook(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5.6h10.6a1.6 1.6 0 0 1 1.6 1.6v12.2H6.6A1.6 1.6 0 0 1 5 17.8Z" />
      <path d="M5 17.8a1.6 1.6 0 0 1 1.6-1.6h10.6" />
      <path d="M8.4 8.8h5.2" />
    </Icon>
  )
}

export function IconHighlight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.4 14.6 13.9 7.1l3 3-7.5 7.5H6.4Z" />
      <path d="M4.4 20.4h15.2" />
    </Icon>
  )
}

export function IconNote(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5.9A1.9 1.9 0 0 1 6.9 4h10.2A1.9 1.9 0 0 1 19 5.9v7.3L13.2 19H6.9A1.9 1.9 0 0 1 5 17.1Z" />
      <path d="M19 13.2h-4.5a1.3 1.3 0 0 0-1.3 1.3V19" />
    </Icon>
  )
}

export function IconNetwork(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5.4" r="2.2" />
      <circle cx="5.9" cy="17.4" r="2.2" />
      <circle cx="18.1" cy="17.4" r="2.2" />
      <path d="M12 7.6v3.2M10.5 10.9 7.3 15.4M13.5 10.9l3.2 4.5" />
    </Icon>
  )
}

export function IconGlobe(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.8c2.3 2.3 3.5 5.2 3.5 8.2S14.3 17.9 12 20.2c-2.3-2.3-3.5-5.2-3.5-8.2S9.7 6.1 12 3.8Z" />
    </Icon>
  )
}

export function IconExternal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.6 5.6h4.8v4.8" />
      <path d="M18.4 5.6 11 13" />
      <path d="M17.2 14.6v3a1.8 1.8 0 0 1-1.8 1.8H6.8A1.8 1.8 0 0 1 5 17.6V8.9a1.8 1.8 0 0 1 1.8-1.8h3" />
    </Icon>
  )
}

export function IconPanel(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <path d="M15.4 5v14" />
    </Icon>
  )
}

export function IconLink(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.2 13.8 13.8 10.2" />
      <path d="M9.1 15.6 7.7 17a3 3 0 0 1-4.2-4.2l2.3-2.3a3 3 0 0 1 4.2 0" />
      <path d="M14.9 8.4 16.3 7a3 3 0 0 1 4.2 4.2l-2.3 2.3a3 3 0 0 1-4.2 0" />
    </Icon>
  )
}

export function IconList(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.6 6.6h11M8.6 12h11M8.6 17.4h11" />
      <path d="M4.6 6.6h.01M4.6 12h.01M4.6 17.4h.01" strokeWidth={2.2} />
    </Icon>
  )
}

export function IconQuote(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.4 11.4c0-2.6 1.6-4.5 4-5.2M5.4 11.4v4a1.4 1.4 0 0 0 1.4 1.4h1.8a1.4 1.4 0 0 0 1.4-1.4v-1.8a1.4 1.4 0 0 0-1.4-1.4H5.4Z" />
      <path d="M13.6 11.4c0-2.6 1.6-4.5 4-5.2M13.6 11.4v4a1.4 1.4 0 0 0 1.4 1.4h1.8a1.4 1.4 0 0 0 1.4-1.4v-1.8a1.4 1.4 0 0 0-1.4-1.4h-3.2Z" />
    </Icon>
  )
}

export function IconRefresh(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.2 12a7.2 7.2 0 1 1-2.2-5.2" />
      <path d="M19.4 4.6v4.2h-4.2" />
    </Icon>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.8 7.2h14.4" />
      <path d="M9.6 7.2V5.4a1.2 1.2 0 0 1 1.2-1.2h2.4a1.2 1.2 0 0 1 1.2 1.2v1.8" />
      <path d="M6.6 7.2 7.4 18a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6l.8-10.8" />
    </Icon>
  )
}
