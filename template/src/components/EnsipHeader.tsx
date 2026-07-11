type Props = {
  authors: string[]
  created: string
  status: string
}

export function EnsipHeader({ authors, created, status }: Props) {
  return (
    <div className="ensip-header">
      <p>
        <strong>Authors:</strong> {authors.join(', ')}
      </p>
      <p>
        <strong>Created:</strong> {created}
      </p>
      <p>
        <strong>Status:</strong> <span className="ensip-status">{status}</span>
      </p>
    </div>
  )
}
