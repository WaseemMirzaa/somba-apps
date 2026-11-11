"use client";

/**
 * Last-resort error page: it replaces the root layout, so the language context is not available. It reads the
 * language the visitor saved in this browser (same key as the language toggle) and defaults to French like the site.
 */
function savedLanguageIsEnglish(): boolean {
  try {
    return window.localStorage.getItem("somba-locale") === "en";
  } catch {
    return false;
  }
}

export default function GlobalError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const en = typeof window !== "undefined" && savedLanguageIsEnglish();
  return (
    <html lang={en ? "en" : "fr"} suppressHydrationWarning>
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", textAlign: "center", margin: 0 }}>
        <div style={{ padding: 24, maxWidth: 420 }}>
          <h1 suppressHydrationWarning style={{ fontSize: 20, marginBottom: 8 }}>{en ? "Something went wrong" : "Une erreur est survenue"}</h1>
          <p suppressHydrationWarning style={{ color: "#64748b", fontSize: 14 }}>
            {en ? "We could not display this page. Try again in a moment." : "Nous n'avons pas pu afficher cette page. Réessayez dans un instant."}
          </p>
          <button suppressHydrationWarning type="button" onClick={() => unstable_retry()} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 12, border: 0, background: "#e11428", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            {en ? "Try again" : "Réessayer"}
          </button>
        </div>
      </body>
    </html>
  );
}
