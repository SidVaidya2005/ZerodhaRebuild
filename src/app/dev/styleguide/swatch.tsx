type SwatchProps = {
  token: string
  className: string
  note?: string
}

/** The token name is rendered beside every swatch so the page doubles as the
 *  reference for which class to reach for, not just what the colour looks like. */
export function Swatch({ token, className, note }: SwatchProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`size-10 rounded-md border border-hairline ${className}`} />
      <div className="min-w-0">
        <code className="font-numeric text-body-sm text-body">{token}</code>
        {note ? <p className="text-caption text-muted">{note}</p> : null}
      </div>
    </div>
  )
}
