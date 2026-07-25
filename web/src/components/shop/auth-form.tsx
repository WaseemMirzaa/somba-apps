"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";

type AuthMode = "register" | "login" | "otp" | "verify-email" | "forgot" | "reset";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { locale } = useLocale();
  const { signInReal } = useAuth();
  const { login: realLogin, register: realRegister } = useRealtime();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fr = locale === "fr";

  async function submit() {
    setError(null);
    // Real backend auth for the customer app.
    if (mode === "login" || mode === "register") {
      if (!email || !password || (mode === "register" && !name)) {
        setError(fr ? "Veuillez remplir tous les champs." : "Please fill in all fields.");
        return;
      }
      setBusy(true);
      try {
        if (mode === "register") {
          await realRegister({ email, password, name, role: "customer" });
        } else {
          await realLogin(email, password);
        }
        signInReal("customer");
        router.push("/shop/account");
      } catch (e) {
        setError(
          (e as Error).message ||
            (fr ? "Échec de la connexion." : "Sign-in failed."),
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    // Password-reset / email-verification steps (backend has no OTP step).
    if (mode === "otp") {
      router.push("/shop/verify-email");
      return;
    }
    if (mode === "forgot") {
      router.push("/shop/reset");
      return;
    }
    if (mode === "reset" || mode === "verify-email") {
      router.push("/shop/login");
    }
  }

  const titles: Record<AuthMode, { en: string; fr: string }> = {
    register: { en: "Create Account", fr: "Créer un compte" },
    login: { en: "Sign In", fr: "Connexion" },
    otp: { en: "Verify OTP", fr: "Vérifier OTP" },
    "verify-email": { en: "Verify Email", fr: "Vérifier l'email" },
    forgot: { en: "Forgot Password", fr: "Mot de passe oublié" },
    reset: { en: "Reset Password", fr: "Réinitialiser" },
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">{fr ? titles[mode].fr : titles[mode].en}</h1>
      <div className="card-premium space-y-4 p-6">
        {mode === "register" && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="text" placeholder={fr ? "Nom complet" : "Full name"} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        {(mode === "register" || mode === "login" || mode === "forgot") && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="email" placeholder={fr ? "E-mail" : "Email"} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        )}
        {(mode === "register" || mode === "login" || mode === "reset") && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="password" placeholder={fr ? "Mot de passe" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        )}
        {mode === "otp" && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
        )}
        {mode === "verify-email" && (
          <p className="text-sm text-slate-600">{fr ? "Cliquez sur le lien envoyé à votre email." : "Click the link sent to your email."}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? (fr ? "Veuillez patienter…" : "Please wait…") : mode === "otp" ? (fr ? "Vérifier" : "Verify") : mode === "forgot" ? (fr ? "Envoyer lien" : "Send link") : mode === "login" ? (fr ? "Se connecter" : "Sign in") : mode === "register" ? (fr ? "Créer le compte" : "Create account") : (fr ? "Continuer" : "Continue")}
        </Button>
      </div>
      <div className="text-center text-sm text-slate-500">
        {mode === "login" && <Link href="/shop/forgot" className="text-[var(--primary)]">{fr ? "Mot de passe oublié ?" : "Forgot password?"}</Link>}
        {mode === "login" && " · "}
        {mode === "login" && <Link href="/shop/register" className="text-[var(--primary)]">{fr ? "Créer un compte" : "Create account"}</Link>}
        {mode === "register" && <Link href="/shop/login" className="text-[var(--primary)]">{fr ? "Déjà un compte ?" : "Already have an account?"}</Link>}
      </div>
    </div>
  );
}
