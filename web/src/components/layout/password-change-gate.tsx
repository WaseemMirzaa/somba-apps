"use client";

import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";
import { ChangePasswordForm } from "@/components/seller/account-security";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { mustChangePassword, passwordChangeText } from "@/lib/password-change";

/**
 * Staff, riders and department admins an administrator created start with a temporary password. While the server holds the
 * account at "change it first" (`user.mustChangePassword`, from the sign-in answer or a refused call), this screen stands in
 * for the whole portal: the same change-password form as the account pages, and a way to sign out. When the change is made
 * the realtime context reconnects with the new tokens and the portal appears.
 */
export function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user, adoptSession } = useRealtime();
  const { logout } = useAuth();
  const { locale } = useLocale();
  const router = useRouter();
  const text = passwordChangeText(locale === "fr");

  if (!mustChangePassword(user)) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10" data-testid="password-change-gate">
      <div className="card-premium w-full max-w-xl space-y-5 p-6 sm:p-8">
        <BrandMark compact />
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">{text.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{text.body}</p>
            <p className="mt-2 text-xs text-slate-500">{text.hint}</p>
          </div>
        </div>
        <ChangePasswordForm temporary onChanged={adoptSession} />
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          {text.signOut}
        </button>
      </div>
    </main>
  );
}
