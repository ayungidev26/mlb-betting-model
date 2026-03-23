import { useRouter } from "next/router"
import { useMemo, useState } from "react"

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
    color: "#e5e7eb",
    padding: "24px",
    fontFamily: "Inter, Arial, sans-serif"
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "rgba(17, 24, 39, 0.96)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: "16px",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.45)",
    padding: "32px"
  },
  badge: {
    display: "inline-flex",
    marginBottom: "12px",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(37, 99, 235, 0.18)",
    color: "#bfdbfe",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase"
  },
  heading: {
    margin: "0 0 10px",
    fontSize: "28px"
  },
  copy: {
    margin: "0 0 24px",
    color: "#cbd5e1",
    lineHeight: 1.5
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: 600
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "10px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    padding: "14px 16px",
    fontSize: "16px",
    marginBottom: "16px"
  },
  button: {
    width: "100%",
    border: 0,
    borderRadius: "10px",
    background: "#2563eb",
    color: "#eff6ff",
    fontWeight: 700,
    fontSize: "16px",
    padding: "14px 16px",
    cursor: "pointer"
  },
  error: {
    marginBottom: "16px",
    padding: "12px 14px",
    borderRadius: "10px",
    background: "rgba(127, 29, 29, 0.45)",
    border: "1px solid rgba(248, 113, 113, 0.45)",
    color: "#fecaca"
  },
  note: {
    marginTop: "16px",
    color: "#94a3b8",
    fontSize: "14px"
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const nextPath = useMemo(() => {
    if (typeof router.query.next === "string" && router.query.next.startsWith("/")) {
      return router.query.next
    }

    return "/"
  }, [router.query.next])

  const statusMessage = useMemo(() => {
    if (router.query.error === "config") {
      return "APP_PASSWORD is not configured yet. Add it to your environment variables before logging in."
    }

    return ""
  }, [router.query.error])

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload.error || "Unable to log in")
        return
      }

      await router.push(nextPath)
    } catch (requestError) {
      setError("Unable to verify the password right now")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.badge}>Protected app</div>
        <h1 style={styles.heading}>Enter password</h1>
        <p style={styles.copy}>
          This MLB dashboard is protected by a single shared password. Enter it below to view the app.
        </p>
        {(statusMessage || error) && (
          <div style={styles.error} role="alert">
            {error || statusMessage}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="password" style={styles.label}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter app password"
            style={styles.input}
          />
          <button type="submit" disabled={isSubmitting} style={styles.button}>
            {isSubmitting ? "Checking..." : "Unlock app"}
          </button>
        </form>
        <p style={styles.note}>
          Access is granted only after a correct password creates a secure session cookie.
        </p>
      </section>
    </main>
  )
}
