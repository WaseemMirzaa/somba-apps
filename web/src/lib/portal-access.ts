/** Role-based portal isolation — each persona may only access their own portal(s). */

export type UserRole = "guest" | "customer" | "seller" | "admin" | "warehouse" | "rider";

export type PortalLink = {
  href: string;
  label: string;
  i18nKey?: string;
};

const PUBLIC_PREFIXES = ["/login", "/legal"];
const MARKETING_PATHS = ["/", "/purchase", "/sell-online"];

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.includes(pathname);
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (isMarketingPath(pathname)) return true;

  switch (role) {
    case "guest":
      return pathname.startsWith("/shop");
    case "customer":
      return pathname.startsWith("/shop");
    case "seller":
      return pathname.startsWith("/seller") || pathname.startsWith("/shop");
    case "admin":
      return pathname.startsWith("/admin");
    case "warehouse":
      return pathname.startsWith("/warehouse");
    case "rider":
      return pathname.startsWith("/rider");
    default:
      return false;
  }
}

export function getHomeForRole(role: UserRole): string {
  switch (role) {
    case "admin": return "/admin";
    case "seller": return "/seller";
    case "warehouse": return "/warehouse";
    case "rider": return "/rider";
    case "customer": return "/shop/account";
    case "guest": return "/";
    default: return "/login";
  }
}

export function getDashboardHref(role: UserRole, personaPortal?: string): string {
  if (personaPortal && personaPortal !== "/") return personaPortal;
  return getHomeForRole(role);
}

/** Portals visible in switcher for the current role. */
export function getVisiblePortals(role: UserRole): PortalLink[] {
  switch (role) {
    case "guest":
    case "customer":
      return [
        { href: "/", label: "Shop" },
        { href: "/shop/account", label: "Account", i18nKey: "myAccount" },
      ];
    case "seller":
      return [{ href: "/seller", label: "Seller", i18nKey: "sellerDashboard" }];
    case "admin":
      return [{ href: "/admin", label: "Admin", i18nKey: "adminPanel" }];
    case "warehouse":
      return [{ href: "/warehouse", label: "Warehouse", i18nKey: "warehousePortal" }];
    case "rider":
      return [{ href: "/rider", label: "Rider", i18nKey: "riderApp" }];
    default:
      return [];
  }
}

export function roleFromPath(pathname: string): UserRole | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/seller")) return "seller";
  if (pathname.startsWith("/warehouse")) return "warehouse";
  if (pathname.startsWith("/rider")) return "rider";
  if (pathname.startsWith("/shop")) return "customer";
  return null;
}

const PORTAL_ROLE_MAP: Record<string, UserRole> = {
  admin: "admin",
  seller: "seller",
  warehouse: "warehouse",
  rider: "rider",
  shop: "customer",
};

export function getPortalCTA(
  portalId: string,
  role: UserRole,
  isAuthenticated: boolean,
  personaPortal?: string
): { href: string; labelEn: string; labelFr: string } {
  if (portalId === "shop") {
    return { href: "/get-app", labelEn: "Start shopping", labelFr: "Acheter maintenant" };
  }

  if (portalId === "seller" && !isAuthenticated) {
    return { href: "/sell-online", labelEn: "Sell online", labelFr: "Vendre en ligne" };
  }

  const portalRole = PORTAL_ROLE_MAP[portalId];
  if (isAuthenticated && portalRole && role === portalRole) {
    return {
      href: getDashboardHref(role, personaPortal),
      labelEn: "Open dashboard",
      labelFr: "Ouvrir le tableau de bord",
    };
  }

  return { href: "/login", labelEn: "Sign in", labelFr: "Se connecter" };
}
