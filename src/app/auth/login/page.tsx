// Placeholder so every sign-in call to action in the public site resolves.
// Feature 12 replaces this file with the real Google OAuth entry point.
export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-display-sm font-semibold text-ink">Sign in</h1>
      <p className="mt-4 max-w-prose text-body text-muted">
        Google sign-in arrives in feature 12. Until then this page is a placeholder so the public
        site has no dead links.
      </p>
    </div>
  )
}
