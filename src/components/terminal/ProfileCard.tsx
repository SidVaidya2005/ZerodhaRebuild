import { ProfileAvatar } from './ProfileAvatar'

/**
 * Who is signed in.
 *
 * **Name, email and avatar come from the live Google session; only the client
 * ID comes from Postgres.** The bootstrap trigger fires on insert alone (F13),
 * so `profiles.full_name` and `profiles.avatar_url` freeze at signup — a user
 * who has since changed their Google display name would be shown the old one
 * indefinitely. `profiles.client_id` is the opposite case: it is issued by this
 * system and exists nowhere else, so it is always read from the database.
 *
 * Nothing here is editable. The identity belongs to Google, and the client ID is
 * the account's name in this system — a user who could choose it could collide
 * with another account's, which is why F35 narrows the table's UPDATE grant to
 * `theme` alone.
 *
 * The avatar is decorative: the name sits beside it in text, so announcing the
 * image too would read the account name twice.
 */
type ProfileCardProps = {
  name: string
  email: string
  avatarUrl: string | null
  clientId: string | null
}

export function ProfileCard({ name, email, avatarUrl, clientId }: ProfileCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-hairline bg-surface p-4">
      <ProfileAvatar src={avatarUrl} name={name} />

      <div className="min-w-0">
        <p className="truncate text-title-sm font-semibold text-ink">{name}</p>
        <p className="truncate text-body-sm text-muted">{email}</p>

        <p className="mt-2 text-caption text-muted">
          Client ID{' '}
          {clientId ? (
            <span className="font-medium text-ink tabular-nums">{clientId}</span>
          ) : (
            // An em dash rather than a fabricated id: every account has one, so
            // its absence means the read failed and must not look like a value.
            <span className="text-muted" aria-label="Client ID unavailable">
              —
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
