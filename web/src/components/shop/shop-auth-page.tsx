"use client";

import Link from "next/link";
import { AuthForm } from "@/components/shop/auth-form";
import { useLocale } from "@/context/locale-context";

type AuthMode = "register" | "login" | "otp" | "verify-email" | "forgot" | "reset";

export function ShopAuthPage({ mode }: { mode: AuthMode }) {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8">
      <Link href="/shop/products" className="inline-block text-sm text-blue-600 hover:underline">
        ← {t("back")} · {t("shop")}
      </Link>
      <AuthForm mode={mode} />
    </div>
  );
}
