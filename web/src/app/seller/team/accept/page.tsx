"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, MailWarning, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/landing/brand-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { authApi, TwoFactorRequired } from "@/lib/realtime/auth-api";
import { authErrorText } from "@/lib/auth-errors";
import { sellerRequest } from "@/lib/seller-api";
import { TEAM_ROLE_LABEL, type TeamRole } from "@/lib/seller-access";
import { errMessage } from "@/lib/seller-labels";

interface Preview {
  storeName: string;
  role: TeamRole;
  email: string;
  expired: boolean;
}

const fieldClass = "input-premium w-full px-4 py-2.5 text-sm";

function AcceptInvitation() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const rt = useRealtime();
  const { signInReal, logout } = useAuth();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [mode, setMode] = useState<"signin" | "register">("register");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  // The invitation as the server knows it (public: the invitee may not have an account yet).
  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no token in the link
      setState("invalid");
      return;
    }
    let alive = true;
    fetch(`${authApi.apiUrl}/api/v1/team/invite/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid");
        return (await res.json()) as Preview;
      })
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setState("ready");
      })
      .catch(() => alive && setState("invalid"));
    return () => {
      alive = false;
    };
  }, [token]);

  const me = rt.user;
  const signedSeller = rt.status === "connected" && me?.role === "seller";
  const signedOther = rt.status === "connected" && !!me && me.role !== "seller";
  const sameEmail = !!me && !!preview && me.email.toLowerCase() === preview.email.toLowerCase();
  const role = preview ? TEAM_ROLE_LABEL[preview.role] : null;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await sellerRequest<{ seller: { name: string } }>("team:accept", { token });
      setJoined(res.seller?.name ?? preview?.storeName ?? "");
      setTimeout(() => router.replace("/seller"), 1200);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      let user;
      if (challenge) user = await rt.login2fa(challenge, code.trim());
      else if (mode === "register") user = await rt.register({ email: preview.email, password, name: name.trim(), role: "seller", locale });
      else user = await rt.login(preview.email, password);
      signInReal(user.role, { name: user.name, email: user.email });
      await accept();
    } catch (err) {
      if (err instanceof TwoFactorRequired) {
        setChallenge(err.challenge);
        setCode("");
      } else {
        setError(authErrorText(err, fr));
      }
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <LanguageToggle className="absolute right-4 top-4 z-20" />
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <BrandMark tone="dark" compact />
        {children}
      </div>
    </div>
  );

  if (state === "loading") return shell(<p className="text-sm text-slate-500">{fr ? "Chargement de l'invitation…" : "Loading the invitation…"}</p>);

  if (state === "invalid" || !preview)
    return shell(
      <div className="space-y-3 text-center">
        <MailWarning className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900">{fr ? "Invitation introuvable" : "Invitation not found"}</h1>
        <p className="text-sm text-slate-600">
          {fr
            ? "Cette invitation n'est plus valide : elle a déjà été utilisée ou annulée. Demandez au propriétaire de la boutique d'en envoyer une nouvelle."
            : "This invitation is no longer valid: it was already used or cancelled. Ask the store owner to send a new one."}
        </p>
        <Link href="/login" className="inline-block text-sm font-medium text-[var(--primary)] hover:underline">{fr ? "Aller à la connexion" : "Go to sign in"}</Link>
      </div>,
    );

  if (joined !== null)
    return shell(
      <div className="space-y-3 text-center" data-testid="joined">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="text-lg font-bold text-slate-900">{fr ? "Bienvenue dans l'équipe !" : "Welcome to the team!"}</h1>
        <p className="text-sm text-slate-600">{fr ? `Vous travaillez maintenant pour « ${joined} ».` : `You now work for "${joined}".`}</p>
      </div>,
    );

  return shell(
    <>
      <div className="space-y-1">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[var(--primary)]"><Users className="h-5 w-5" /></span>
        <h1 className="text-xl font-bold text-slate-900">
          {fr ? `Rejoindre « ${preview.storeName} »` : `Join "${preview.storeName}"`}
        </h1>
        <p className="text-sm text-slate-600">
          {fr
            ? `Vous êtes invité(e) avec le rôle ${role?.fr}. ${role?.descFr}`
            : `You are invited with the ${role?.en} role. ${role?.descEn}`}
        </p>
        <p className="text-xs text-slate-500">{preview.email}</p>
      </div>

      {preview.expired ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {fr ? "Cette invitation a expiré. Demandez au propriétaire de la boutique d'en envoyer une nouvelle." : "This invitation has expired. Ask the store owner to send a new one."}
        </p>
      ) : signedSeller && sameEmail ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{fr ? `Connecté en tant que ${me?.email}.` : `Signed in as ${me?.email}.`}</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button className="w-full" onClick={() => void accept()} disabled={busy}>
            {busy ? (fr ? "Veuillez patienter…" : "Please wait…") : fr ? "Accepter l'invitation" : "Accept the invitation"}
          </Button>
        </div>
      ) : signedSeller || signedOther ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {fr
              ? `Vous êtes connecté avec ${me?.email}, mais l'invitation est pour ${preview.email}. Déconnectez-vous puis revenez sur ce lien.`
              : `You are signed in as ${me?.email}, but the invitation is for ${preview.email}. Sign out, then open this link again.`}
          </p>
          <Button variant="secondary" className="w-full" onClick={() => logout()}>{fr ? "Se déconnecter" : "Sign out"}</Button>
        </div>
      ) : (
        <form onSubmit={authenticate} className="space-y-3">
          {!challenge && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
              <button type="button" onClick={() => { setMode("register"); setError(null); }} className={`rounded-lg px-3 py-1.5 ${mode === "register" ? "bg-white shadow-sm" : "text-slate-500"}`}>
                {fr ? "Créer un compte vendeur" : "Create a seller account"}
              </button>
              <button type="button" onClick={() => { setMode("signin"); setError(null); }} className={`rounded-lg px-3 py-1.5 ${mode === "signin" ? "bg-white shadow-sm" : "text-slate-500"}`}>
                {fr ? "J'ai déjà un compte" : "I have an account"}
              </button>
            </div>
          )}
          {challenge ? (
            <input className={`${fieldClass} tracking-widest`} autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} aria-label={fr ? "Code de vérification" : "Verification code"} placeholder={fr ? "Code à 6 chiffres ou code de récupération" : "6-digit code or recovery code"} />
          ) : (
            <>
              <input className={`${fieldClass} bg-slate-50 text-slate-600`} type="email" value={preview.email} readOnly aria-label={fr ? "E-mail de l'invitation" : "Invitation e-mail"} />
              {mode === "register" && (
                <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={fr ? "Votre nom" : "Your name"} aria-label={fr ? "Votre nom" : "Your name"} autoComplete="name" />
              )}
              <input className={fieldClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={fr ? "Mot de passe" : "Password"} aria-label={fr ? "Mot de passe" : "Password"} autoComplete={mode === "register" ? "new-password" : "current-password"} />
              {mode === "register" && password !== "" && password.length < 8 && <p className="text-xs text-red-600">{fr ? "8 caractères au minimum." : "At least 8 characters."}</p>}
            </>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || (challenge ? code.trim().length < 6 : password.length < (mode === "register" ? 8 : 1) || (mode === "register" && name.trim().length < 2))}
          >
            {busy
              ? fr ? "Veuillez patienter…" : "Please wait…"
              : challenge
                ? fr ? "Vérifier et rejoindre" : "Verify and join"
                : mode === "register"
                  ? fr ? "Créer le compte et rejoindre" : "Create account and join"
                  : fr ? "Se connecter et rejoindre" : "Sign in and join"}
          </Button>
        </form>
      )}
    </>,
  );
}

export default function TeamAcceptPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitation />
    </Suspense>
  );
}
