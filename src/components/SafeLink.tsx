import { safeHttpUrl } from '../util/safeUrl.ts'

type SafeLinkProps = {
  href: string
  children: React.ReactNode
  'aria-label'?: string
}

/**
 * A link only for a valid absolute HTTP(S) URL. Anything else is shown as plain text.
 */
export const SafeLink: React.FC<SafeLinkProps> = ({
  href,
  children,
  ...rest
}) => {
  const safe = safeHttpUrl(href)
  if (safe === null) return <span>{children}</span>
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  )
}
