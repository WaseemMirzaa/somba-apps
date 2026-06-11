"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { type TranslationKey } from "@/lib/i18n";

type AuthMode = "register" | "login" | "otp" | "verify-email" | "forgot" | "reset";

const TITLE_KEYS: Record<AuthMode, TranslationKey> = {
  register: "createAccount",
  login: "signInTitle",
  otp: "verifyOtp",
  "verify-email": "verifyEmailTitle",
  forgot: "forgotPasswordTitle",
  reset: "resetPasswordTitle",
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { t } = useLocale();
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  function submit() {
    if (mode === "register" || mode === "login") {
      login("customer");
      router.push(mode === "register" ? "/shop/otp" : "/shop/account");
      return;
    }
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

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">{t(TITLE_KEYS[mode])}</h1>
      <div className="card-premium space-y-4 p-6">
        {(mode === "register" || mode === "login" || mode === "forgot") && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        {(mode === "register" || mode === "login" || mode === "reset") && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="password" placeholder={t("passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
        {mode === "otp" && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={t("otpPlaceholder")} value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
        )}
        {mode === "verify-email" && (
          <p className="text-sm text-slate-600">{t("verifyEmailMock")}</p>
        )}
        <Button onClick={submit} className="w-full">
          {mode === "otp" ? t("verify") : mode === "forgot" ? t("sendLink") : t("continueBtn")}
        </Button>
      </div>
      <div className="text-center text-sm text-slate-500">
        {mode === "login" && <Link href="/shop/forgot" className="text-blue-600">{t("forgotPasswordLink")}</Link>}
        {mode === "login" && " · "}
        {mode === "login" && <Link href="/shop/register" className="text-blue-600">{t("createAccountLink")}</Link>}
        {mode === "register" && <Link href="/shop/login" className="text-blue-600">{t("alreadyHaveAccount")}</Link>}
      </div>
    </div>
  );
}
