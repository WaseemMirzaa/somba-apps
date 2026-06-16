#!/usr/bin/env python3
"""
Somba & Tekka — Flowchart generator.
Builds Graphviz DOT for each business flow and renders high-resolution PNGs.
Run:  python3 diagrams.py
"""
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "diagrams")
os.makedirs(OUT, exist_ok=True)

# ---- Palette -------------------------------------------------------------
BRAND        = "#1d4ed8"   # blue-700  (start / primary)
BRAND_DK     = "#1e3a8a"   # blue-900
PROC_FILL    = "#EAF1FB"   # light blue process
PROC_LINE    = "#1d4ed8"
DEC_FILL     = "#FEF3C7"   # amber decision
DEC_LINE     = "#d97706"
TERM_FILL    = "#D1FAE5"   # green terminal
TERM_LINE    = "#059669"
NOTE_FILL    = "#F1F5F9"   # slate note
NOTE_LINE    = "#94a3b8"
DANGER       = "#dc2626"
EDGE         = "#64748b"
INK          = "#0f172a"

# Actor colours (used in the cross-portal lifecycle + portal headers)
A_CUST = "#2563eb"   # customer  - blue
A_SELL = "#7c3aed"   # seller    - violet
A_WARE = "#0891b2"   # warehouse - cyan
A_RIDE = "#059669"   # rider     - green
A_ADMN = "#b45309"   # admin     - amber/brown
A_SYS  = "#475569"   # system    - slate

FONT = "Helvetica"


def _hdr(rankdir="TB", nodesep=0.32, ranksep=0.42, extra=""):
    return f"""  graph [rankdir={rankdir}, bgcolor="white", fontname="{FONT}", nodesep={nodesep}, ranksep={ranksep}, pad=0.28, {extra}];
  node  [fontname="{FONT}", fontsize=12, margin="0.17,0.10", penwidth=1.3];
  edge  [fontname="{FONT}", fontsize=10, color="{EDGE}", arrowsize=0.75, penwidth=1.1];
"""


def node(nid, label, fill=PROC_FILL, line=PROC_LINE, shape="box",
         style="rounded,filled", fontcolor=INK, fontsize=12, width=None, penwidth=1.3):
    w = f', width={width}, fixedsize=false' if width else ""
    return (f'  "{nid}" [label="{label}", shape={shape}, style="{style}", '
            f'fillcolor="{fill}", color="{line}", fontcolor="{fontcolor}", '
            f'fontsize={fontsize}, penwidth={penwidth}{w}];\n')


def start(nid, label):
    return node(nid, label, fill=BRAND, line=BRAND_DK, shape="oval",
                style="filled", fontcolor="white", penwidth=1.6)


def proc(nid, label, fill=PROC_FILL, line=PROC_LINE):
    return node(nid, label, fill=fill, line=line)


def dec(nid, label):
    return node(nid, label, fill=DEC_FILL, line=DEC_LINE, shape="diamond",
                style="filled")


def term(nid, label, ok=True):
    return node(nid, label, fill=TERM_FILL if ok else "#FEE2E2",
                line=TERM_LINE if ok else DANGER, shape="box", style="filled")


def note(nid, label):
    return node(nid, label, fill=NOTE_FILL, line=NOTE_LINE, shape="note",
                style="filled", fontsize=10)


def actor(nid, label, color):
    return node(nid, label, fill="white", line=color, fontcolor=INK, penwidth=2.0)


def edge(a, b, label="", style="solid", color=EDGE, fontcolor=None):
    lab = f', label="{label}"' if label else ""
    fc = f', fontcolor="{fontcolor}"' if fontcolor else ""
    return f'  "{a}" -> "{b}" [style={style}, color="{color}"{lab}{fc}];\n'


def render(name, dot, dpi=200):
    dot_path = os.path.join(OUT, f"{name}.dot")
    png_path = os.path.join(OUT, f"{name}.png")
    with open(dot_path, "w") as f:
        f.write(dot)
    subprocess.run(["dot", "-Tpng", f"-Gdpi={dpi}", "-o", png_path, dot_path], check=True)
    return png_path


# =========================================================================
# 1. SYSTEM ARCHITECTURE OVERVIEW
# =========================================================================
def g_architecture():
    s = "digraph arch {\n" + _hdr(rankdir="TB", nodesep=0.30, ranksep=0.55)
    s += '  node [fontsize=11];\n'

    # Presentation layer (portals)
    s += '  subgraph cluster_pres {\n'
    s += f'    label="Presentation layer — 6 portals"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#F8FAFC"; color="#cbd5e1"; labeljust=l;\n'
    s += actor("p_cust",  "Customer Shop\n/shop  +  Flutter app", A_CUST)
    s += actor("p_sell",  "Seller Portal\n/seller", A_SELL)
    s += actor("p_admin", "Super Admin\n/admin", A_ADMN)
    s += actor("p_ware",  "Warehouse\n/warehouse", A_WARE)
    s += actor("p_ride",  "Rider Portal\n/rider  +  Flutter app", A_RIDE)
    s += actor("p_land",  "Landing / Auth\n/  ·  /login", A_SYS)
    s += '    {rank=same; p_cust; p_sell; p_admin; p_ware; p_ride;}\n'
    s += '  }\n'

    # Shared contracts
    s += '  subgraph cluster_shared {\n'
    s += f'    label="Shared contracts  (shared/)"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#EEF2FF"; color="#a5b4fc"; labeljust=l;\n'
    s += proc("s_reg",  "Screen registry\nCF / SF / AF / WF / RF", fill="white", line="#6366f1")
    s += proc("s_mkt",  "Market profiles\nFrance · DRC", fill="white", line="#6366f1")
    s += proc("s_types","Shared types\norder / payout / status enums", fill="white", line="#6366f1")
    s += proc("s_ctx",  "React contexts\nAuth · Cart · Notify · Dispute", fill="white", line="#6366f1")
    s += '    {rank=same; s_reg; s_mkt; s_types; s_ctx;}\n'
    s += '  }\n'

    # Data / API
    s += '  subgraph cluster_data {\n'
    s += f'    label="Mock data & API"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#F0FDFA"; color="#5eead4"; labeljust=l;\n'
    s += proc("d_api",  "NestJS Mock API\n:3001  /api/v1", fill="white", line=A_WARE)
    s += proc("d_ent",  "Mock entities\nproducts · orders · sellers\nparcels · riders · disputes", fill="white", line=A_WARE)
    s += '    {rank=same; d_api; d_ent;}\n'
    s += '  }\n'

    for p in ["p_cust", "p_sell", "p_admin", "p_ware", "p_ride"]:
        s += edge(p, "s_ctx", style="solid", color="#cbd5e1")
    s += edge("s_ctx", "d_ent", color="#94a3b8")
    s += edge("s_types", "d_api", color="#94a3b8")
    s += edge("d_api", "d_ent", label="reads", color="#94a3b8")
    s += "}\n"
    return s


# =========================================================================
# 2. END-TO-END ORDER LIFECYCLE (cross-portal)
# =========================================================================
def g_lifecycle():
    s = "digraph life {\n" + _hdr(rankdir="TB", nodesep=0.30, ranksep=0.40)
    s += '  node [fontsize=11];\n'

    s += start("L0", "Customer places order")
    s += actor("L1", "CUSTOMER\nBrowse → cart → checkout → pay\nOrder: pending → confirmed", A_CUST)
    s += actor("L2", "SELLER\nNew order → Accept → processing\n→ Mark ready for pickup", A_SELL)
    s += actor("L3", "WAREHOUSE\nParcel inbound → receive → sort\n→ ready → batch builder", A_WARE)
    s += actor("L4", "WAREHOUSE\nAssign rider → Dispatch batch\nOrder: shipped → out_for_delivery", A_WARE)
    s += actor("L5", "RIDER\nPick up → navigate → attempt delivery", A_RIDE)
    s += dec("L6", "Delivery\nsuccessful?")
    s += actor("L7", "RIDER · Proof of Delivery\nOTP + photo + COD cash\nOrder: delivered", A_RIDE)
    s += actor("L8", "RIDER · Failed delivery\nreason logged →\nreturn to warehouse", A_RIDE)
    s += actor("L9", "WAREHOUSE\nCOD shift reconciliation\n(rider remits cash)", A_WARE)
    s += actor("L10", "SELLER\nEarnings accrue → 48h clearance\n→ request payout", A_SELL)
    s += actor("L11", "SUPER ADMIN\nApprove payout → paid\nAudit-logged", A_ADMN)
    s += term("L12", "Order complete\n& settled")

    # returns / dispute branch
    s += actor("R1", "CUSTOMER\nReturn / exchange / dispute\n(within return window)", A_CUST)
    s += actor("R2", "SELLER · ADMIN\nInspect → resolve\n(favor buyer / seller)", A_ADMN)
    s += actor("R3", "SUPER ADMIN\nAuthorise refund\n(original method / wallet)", A_ADMN)

    s += edge("L0", "L1")
    s += edge("L1", "L2", label="paid")
    s += edge("L2", "L3", label="handoff")
    s += edge("L3", "L4")
    s += edge("L4", "L5", label="in transit")
    s += edge("L5", "L6")
    s += edge("L6", "L7", label="yes", color=TERM_LINE, fontcolor=TERM_LINE)
    s += edge("L6", "L8", label="no", color=DANGER, fontcolor=DANGER)
    s += edge("L8", "L4", label="re-dispatch", style="dashed", color=DANGER)
    s += edge("L7", "L9", label="COD orders")
    s += edge("L9", "L10")
    s += edge("L7", "L10", label="prepaid", style="dashed")
    s += edge("L10", "L11")
    s += edge("L11", "L12")
    s += edge("L7", "R1", label="post-delivery", style="dashed", color=A_CUST)
    s += edge("R1", "R2")
    s += edge("R2", "R3", label="if approved")
    s += edge("R3", "L12", style="dashed")
    s += "}\n"
    return s


# =========================================================================
# 3. ORDERING FLOW (customer purchase funnel)
# =========================================================================
def g_ordering():
    s = "digraph ordering {\n" + _hdr(rankdir="TB")
    s += start("o_start", "Customer in shop")
    s += proc("o_pdp",   "Product detail (PDP)\nvariant · zone/pincode check\nQ&A · reviews · wishlist")
    s += proc("o_cart",  "Cart\nqty · save for later · group by seller")
    s += dec("o_promo",  "Apply promo code?")
    s += proc("o_promo_y","SOMBA10 (10%, min $50)\nSAVE20 ($20, min $100)\nif min-order met")
    s += dec("o_auth",   "Signed in?")
    s += proc("o_guest", "Guest checkout\n(email only)")
    s += proc("o_addr",  "Step 1 · Delivery address\n→ sets zone delivery fee")
    s += proc("o_opts",  "Step 2 · Delivery options\ncross-city · open-box · note")
    s += proc("o_pay",   "Step 3 · Payment method")
    s += dec("o_cod",    "COD ≤ market cap?\n(FR $500 / DRC $200)")
    s += proc("o_methods","Card · Wallet · Airtel Money\n(+ COD if eligible)")
    s += dec("o_payok",  "Payment\nauthorised?")
    s += proc("o_retry", "Hold reservation 15 min\n→ retry payment", fill="#FEE2E2", line=DANGER)
    s += term("o_conf",  "Step 4 · Order confirmed\nstatus = processing\n→ tracking available")

    s += edge("o_start", "o_pdp")
    s += edge("o_pdp", "o_cart", label="add to cart")
    s += edge("o_cart", "o_promo")
    s += edge("o_promo", "o_promo_y", label="yes")
    s += edge("o_promo", "o_auth", label="no")
    s += edge("o_promo_y", "o_auth")
    s += edge("o_auth", "o_addr", label="yes")
    s += edge("o_auth", "o_guest", label="no")
    s += edge("o_guest", "o_addr")
    s += edge("o_addr", "o_opts")
    s += edge("o_opts", "o_pay")
    s += edge("o_pay", "o_cod")
    s += edge("o_cod", "o_methods", label="yes")
    s += edge("o_cod", "o_methods", label="no → card only", style="dashed")
    s += edge("o_methods", "o_payok")
    s += edge("o_payok", "o_conf", label="yes", color=TERM_LINE, fontcolor=TERM_LINE)
    s += edge("o_payok", "o_retry", label="no", color=DANGER, fontcolor=DANGER)
    s += edge("o_retry", "o_payok", style="dashed", color=DANGER)
    s += "}\n"
    return s


# =========================================================================
# 4. DELIVERY & FULFILLMENT FLOW (warehouse + rider operations)
# =========================================================================
def g_delivery():
    s = "digraph delivery {\n" + _hdr(rankdir="TB", ranksep=0.38)

    s += '  subgraph cluster_w {\n'
    s += f'    label="Warehouse operations"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#ECFEFF"; color="{A_WARE}"; labeljust=l;\n'
    s += start("d_in", "Parcel inbound\n(picked up from seller)")
    s += proc("d_recv", "Receiving\nbarcode scan → inspect", fill="white", line=A_WARE)
    s += dec("d_insp",  "Inspection OK?")
    s += proc("d_exc",  "Exception / incident\ndamaged · missing · mismatch", fill="#FEE2E2", line=DANGER)
    s += proc("d_sort", "Sorting\nassign zone", fill="white", line=A_WARE)
    s += proc("d_ready","status = ready", fill="white", line=A_WARE)
    s += proc("d_batch","Batch builder\nadd parcels · optimise route", fill="white", line=A_WARE)
    s += proc("d_assign","Assign rider\nauto-suggest nearest / manual", fill="white", line=A_WARE)
    s += proc("d_disp", "Dispatch batch\nstatus = dispatched", fill="white", line=A_WARE)
    s += '  }\n'

    s += '  subgraph cluster_r {\n'
    s += f'    label="Rider — last mile"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#ECFDF5"; color="{A_RIDE}"; labeljust=l;\n'
    s += proc("d_pick", "Rider picks up batch\nin_transit", fill="white", line=A_RIDE)
    s += proc("d_nav",  "Navigate to stop\ncall customer", fill="white", line=A_RIDE)
    s += proc("d_pod",  "Proof of delivery\nOTP · photo · open-box\nCOD cash collected", fill="white", line=A_RIDE)
    s += dec("d_ok",    "Delivered?")
    s += proc("d_fail", "Failed delivery\nreason logged", fill="#FEE2E2", line=DANGER)
    s += '  }\n'

    s += term("d_done", "Order delivered")
    s += proc("d_cod",  "COD shift reconciliation\nexpected vs collected\nvariance → investigate", fill="#FEF3C7", line=DEC_LINE)
    s += proc("d_aged", "Aged / stuck parcel\n(>72h) → escalate", fill="#FEF3C7", line=DEC_LINE)

    s += edge("d_in", "d_recv")
    s += edge("d_recv", "d_insp")
    s += edge("d_insp", "d_sort", label="yes")
    s += edge("d_insp", "d_exc", label="no", color=DANGER, fontcolor=DANGER)
    s += edge("d_sort", "d_ready")
    s += edge("d_ready", "d_batch")
    s += edge("d_batch", "d_assign")
    s += edge("d_assign", "d_disp")
    s += edge("d_disp", "d_pick", label="out for delivery")
    s += edge("d_pick", "d_nav")
    s += edge("d_nav", "d_pod")
    s += edge("d_pod", "d_ok")
    s += edge("d_ok", "d_done", label="yes", color=TERM_LINE, fontcolor=TERM_LINE)
    s += edge("d_ok", "d_fail", label="no", color=DANGER, fontcolor=DANGER)
    s += edge("d_fail", "d_disp", label="re-dispatch", style="dashed", color=DANGER)
    s += edge("d_done", "d_cod", label="COD orders", style="dashed")
    s += edge("d_ready", "d_aged", label="if stuck", style="dashed", color=DEC_LINE)
    s += "}\n"
    return s


# =========================================================================
# 5. CUSTOMER PORTAL (capability / navigation map)
# =========================================================================
def g_customer():
    s = "digraph customer {\n" + _hdr(rankdir="TB", ranksep=0.45)
    s += start("c_root", "Customer Portal\n/shop")

    s += '  subgraph cluster_auth {\n'
    s += f'    label="Account & auth"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#EFF6FF"; color="{A_CUST}"; labeljust=l;\n'
    s += proc("c_reg", "Register → OTP →\nverify email", fill="white", line=A_CUST)
    s += proc("c_log", "Login\nforgot / reset", fill="white", line=A_CUST)
    s += '  }\n'

    s += '  subgraph cluster_disc {\n'
    s += f'    label="Discover"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#EFF6FF"; color="{A_CUST}"; labeljust=l;\n'
    s += proc("c_home", "Home feed\nbuy again · recently viewed", fill="white", line=A_CUST)
    s += proc("c_search","Search + autocomplete\ncategories · filters", fill="white", line=A_CUST)
    s += proc("c_pdp",  "Product / store\nQ&A · reviews · follow", fill="white", line=A_CUST)
    s += proc("c_deals","Flash deals\n· wishlist", fill="white", line=A_CUST)
    s += '  }\n'

    s += '  subgraph cluster_buy {\n'
    s += f'    label="Buy"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#EFF6FF"; color="{A_CUST}"; labeljust=l;\n'
    s += proc("c_cart", "Cart · promo", fill="white", line=A_CUST)
    s += proc("c_check","Checkout (4 steps)\n→ payment", fill="white", line=A_CUST)
    s += term("c_order","Order confirmed")
    s += '  }\n'

    s += '  subgraph cluster_post {\n'
    s += f'    label="After purchase"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#EFF6FF"; color="{A_CUST}"; labeljust=l;\n'
    s += proc("c_track","Orders · live tracking\nreorder", fill="white", line=A_CUST)
    s += proc("c_ret",  "Return / exchange\nrequest", fill="white", line=A_CUST)
    s += proc("c_disp", "Dispute · support\nticket", fill="white", line=A_CUST)
    s += '  }\n'

    s += '  subgraph cluster_acct {\n'
    s += f'    label="Account hub"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#EFF6FF"; color="{A_CUST}"; labeljust=l;\n'
    s += proc("c_wal",  "Somba wallet\ntop-up · transactions", fill="white", line=A_CUST)
    s += proc("c_ref",  "Refer & earn\n$10 / $10", fill="white", line=A_CUST)
    s += proc("c_notif","Addresses · notifications\nhelp / delete account", fill="white", line=A_CUST)
    s += '  }\n'

    s += edge("c_root", "c_log")
    s += edge("c_root", "c_home")
    s += edge("c_log", "c_reg", style="dashed")
    s += edge("c_home", "c_search")
    s += edge("c_search", "c_pdp")
    s += edge("c_home", "c_deals", style="dashed")
    s += edge("c_pdp", "c_cart", label="add")
    s += edge("c_cart", "c_check")
    s += edge("c_check", "c_order")
    s += edge("c_order", "c_track")
    s += edge("c_track", "c_ret", label="if delivered", style="dashed")
    s += edge("c_ret", "c_disp", style="dashed")
    s += edge("c_root", "c_wal", style="dashed", color="#cbd5e1")
    s += edge("c_wal", "c_ref", style="dashed", color="#cbd5e1")
    s += edge("c_ref", "c_notif", style="dashed", color="#cbd5e1")
    s += "}\n"
    return s


# =========================================================================
# 6. SELLER PORTAL
# =========================================================================
def g_seller():
    s = "digraph seller {\n" + _hdr(rankdir="TB", ranksep=0.40)

    s += '  subgraph cluster_on {\n'
    s += f'    label="Onboarding"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#F5F3FF"; color="{A_SELL}"; labeljust=l;\n'
    s += start("se_land", "Sell-online landing")
    s += proc("se_sub",  "Choose plan & subscribe\n(Starter/Pro/Enterprise)", fill="white", line=A_SELL)
    s += proc("se_reg",  "Register (no KYC)\nbusiness info", fill="white", line=A_SELL)
    s += proc("se_pend", "Pending approval", fill="white", line=A_SELL)
    s += dec("se_dec",   "Admin\napproves?")
    s += proc("se_res",  "Resubmit\ncorrections", fill="#FEE2E2", line=DANGER)
    s += '  }\n'

    s += proc("se_dash", "Seller dashboard\nKPIs · health badge · finance snapshot",
              fill="#EDE9FE", line=A_SELL)

    s += '  subgraph cluster_cat {\n'
    s += f'    label="Catalog"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#F5F3FF"; color="{A_SELL}"; labeljust=l;\n'
    s += proc("se_wiz",  "7-step product wizard\nbasics·media·variants·stock\nprice·shipping·review", fill="white", line=A_SELL)
    s += proc("se_mod",  "Submit → moderation\ndraft → pending", fill="white", line=A_SELL)
    s += proc("se_inv",  "Inventory · CSV\nflag unavailable", fill="white", line=A_SELL)
    s += '  }\n'

    s += '  subgraph cluster_ful {\n'
    s += f'    label="Fulfilment"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#F5F3FF"; color="{A_SELL}"; labeljust=l;\n'
    s += proc("se_ord",  "New order → Accept\nprocessing → Mark ready", fill="white", line=A_SELL)
    s += proc("se_ship", "Hand off to warehouse\ntrack shipment", fill="white", line=A_SELL)
    s += proc("se_rr",   "Returns · replacements\ndisputes", fill="white", line=A_SELL)
    s += '  }\n'

    s += '  subgraph cluster_fin {\n'
    s += f'    label="Money & growth"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#F5F3FF"; color="{A_SELL}"; labeljust=l;\n'
    s += proc("se_fin",  "Finance · transactions\ncommission 8–15%", fill="white", line=A_SELL)
    s += dec("se_clr",   "Cleared?\n(after delivery +48h)")
    s += proc("se_pay",  "Request payout\n→ admin approval", fill="white", line=A_SELL)
    s += proc("se_mktg", "Storefront · promotions\nanalytics · reviews", fill="white", line=A_SELL)
    s += '  }\n'

    s += edge("se_land", "se_sub")
    s += edge("se_sub", "se_reg")
    s += edge("se_reg", "se_pend")
    s += edge("se_pend", "se_dec")
    s += edge("se_dec", "se_dash", label="yes", color=TERM_LINE, fontcolor=TERM_LINE)
    s += edge("se_dec", "se_res", label="no", color=DANGER, fontcolor=DANGER)
    s += edge("se_res", "se_pend", style="dashed")
    s += edge("se_dash", "se_wiz")
    s += edge("se_wiz", "se_mod")
    s += edge("se_mod", "se_inv", style="dashed")
    s += edge("se_dash", "se_ord")
    s += edge("se_ord", "se_ship")
    s += edge("se_ship", "se_rr", style="dashed")
    s += edge("se_dash", "se_fin", style="dashed", color="#cbd5e1")
    s += edge("se_fin", "se_clr")
    s += edge("se_clr", "se_pay", label="yes", color=TERM_LINE, fontcolor=TERM_LINE)
    s += edge("se_dash", "se_mktg", style="dashed", color="#cbd5e1")
    s += "}\n"
    return s


# =========================================================================
# 7. RIDER PORTAL
# =========================================================================
def g_rider():
    s = "digraph rider {\n" + _hdr(rankdir="TB", ranksep=0.40)
    s += start("ri_login", "Rider login")
    s += proc("ri_first", "First-time?\nset password", fill="#ECFDF5", line=A_RIDE)
    s += proc("ri_duty",  "Go on-duty\navailability toggle", fill="#ECFDF5", line=A_RIDE)
    s += proc("ri_notif", "Receive task_assigned\nnotification", fill="#ECFDF5", line=A_RIDE)
    s += proc("ri_tasks", "Task list / batch overview\nordered stops", fill="#ECFDF5", line=A_RIDE)
    s += proc("ri_detail","Task detail\norder · customer · COD · notes", fill="#ECFDF5", line=A_RIDE)
    s += proc("ri_nav",   "Navigate (map)\ncall customer", fill="#ECFDF5", line=A_RIDE)
    s += proc("ri_pick",  "Pick up\nassigned → picked_up → in_transit", fill="#ECFDF5", line=A_RIDE)
    s += dec("ri_try",    "At customer:\ndeliver?")

    s += '  subgraph cluster_pod {\n'
    s += f'    label="Proof of delivery (RF-09)"; fontname="{FONT}"; fontsize=11; style="rounded,filled"; fillcolor="#ECFDF5"; color="{A_RIDE}"; labeljust=l;\n'
    s += proc("ri_otp",  "Enter OTP + recipient\nphoto / signature", fill="white", line=A_RIDE)
    s += dec("ri_cod",   "COD order?")
    s += proc("ri_cash", "Collect cash\ntick 'cash collected'", fill="white", line=A_RIDE)
    s += '  }\n'

    s += term("ri_deliv", "status = delivered")
    s += proc("ri_fail",  "Failed delivery (RF-10)\nunavailable · wrong address\nrefused · payment issue", fill="#FEE2E2", line=DANGER)
    s += proc("ri_shift", "COD shift summary\nremit cash to warehouse", fill="#FEF3C7", line=DEC_LINE)
    s += proc("ri_earn",  "Earnings & history\nper-delivery + incentives", fill="#ECFDF5", line=A_RIDE)

    s += edge("ri_login", "ri_first")
    s += edge("ri_first", "ri_duty")
    s += edge("ri_duty", "ri_notif")
    s += edge("ri_notif", "ri_tasks")
    s += edge("ri_tasks", "ri_detail")
    s += edge("ri_detail", "ri_nav")
    s += edge("ri_nav", "ri_pick")
    s += edge("ri_pick", "ri_try")
    s += edge("ri_try", "ri_otp", label="yes", color=TERM_LINE, fontcolor=TERM_LINE)
    s += edge("ri_try", "ri_fail", label="no", color=DANGER, fontcolor=DANGER)
    s += edge("ri_otp", "ri_cod")
    s += edge("ri_cod", "ri_cash", label="yes")
    s += edge("ri_cod", "ri_deliv", label="no")
    s += edge("ri_cash", "ri_deliv")
    s += edge("ri_deliv", "ri_shift", label="end of shift", style="dashed")
    s += edge("ri_shift", "ri_earn", style="dashed")
    s += edge("ri_fail", "ri_tasks", label="next task", style="dashed", color=DANGER)
    s += "}\n"
    return s


# =========================================================================
# 8. SUPER ADMIN PORTAL
# =========================================================================
def g_admin():
    s = "digraph admin {\n" + _hdr(rankdir="TB", nodesep=0.28, ranksep=0.55)
    s += start("ad_root", "Super Admin  /admin")
    s += note("ad_roles", "6 sub-roles (RBAC): Operations · Finance · Support\nMarketing · Moderation · Warehouse\n— every action is audit-logged")
    s += '  {rank=same; ad_root; ad_roles;}\n'

    # Band 1 — Trust & approvals
    s += '  subgraph cluster_trust {\n'
    s += f'    label="Trust & approvals"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#FFFBEB"; color="{A_ADMN}"; labeljust=l;\n'
    s += proc("ad_sell", "Seller approval\npending →\napproved / rejected", fill="white", line=A_ADMN)
    s += proc("ad_prod", "Product moderation\npending → approved /\nrejected / changes", fill="white", line=A_ADMN)
    s += proc("ad_rev",  "Review & content\nmoderation", fill="white", line=A_ADMN)
    s += proc("ad_fraud","Fraud & risk\nopen → reviewed\n→ blocked", fill="white", line=A_ADMN)
    s += '    {rank=same; ad_sell; ad_prod; ad_rev; ad_fraud;}\n'
    s += '  }\n'

    # Band 2 — Money
    s += '  subgraph cluster_money {\n'
    s += f'    label="Money"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#FFFBEB"; color="{A_ADMN}"; labeljust=l;\n'
    s += proc("ad_disp", "Dispute resolution\nfavor buyer / seller", fill="white", line=A_ADMN)
    s += proc("ad_ref",  "Refund authorisation\noriginal method / wallet", fill="white", line=A_ADMN)
    s += proc("ad_pay",  "Payout approval\nrequested → approved → paid\n($10 min · 48h clearance)", fill="white", line=A_ADMN)
    s += '    {rank=same; ad_disp; ad_ref; ad_pay;}\n'
    s += '  }\n'

    # Band 3 — Catalog / marketing / platform
    s += '  subgraph cluster_plat {\n'
    s += f'    label="Catalog · marketing · platform"; fontname="{FONT}"; fontsize=12; style="rounded,filled"; fillcolor="#FFFBEB"; color="{A_ADMN}"; labeljust=l;\n'
    s += proc("ad_cat",  "Categories & commission\nflash sales · promotions", fill="white", line=A_ADMN)
    s += proc("ad_cms",  "CMS · broadcasts\ncampaigns", fill="white", line=A_ADMN)
    s += proc("ad_set",  "Settings & zones\ndual-market · FX\nCOD cap · fees", fill="white", line=A_ADMN)
    s += proc("ad_ware", "Warehouses\ncreate hub +\ncredentials", fill="white", line=A_ADMN)
    s += '    {rank=same; ad_cat; ad_cms; ad_set; ad_ware;}\n'
    s += '  }\n'

    s += proc("ad_obs", "Oversight  —  audit log · analytics (GMV / SLA) · orders · customers · finance",
              fill="#FEF3C7", line=DEC_LINE)

    # vertical band-to-band connectors (keep bands stacked)
    s += edge("ad_root", "ad_sell")
    s += edge("ad_sell", "ad_disp", color="#cbd5e1")
    s += edge("ad_fraud", "ad_pay", color="#cbd5e1")
    s += edge("ad_disp", "ad_cat", color="#cbd5e1")
    s += edge("ad_pay", "ad_ware", color="#cbd5e1")
    s += edge("ad_cat", "ad_obs", color="#cbd5e1")
    s += edge("ad_ware", "ad_obs", color="#cbd5e1")
    # intra-band status flow
    s += edge("ad_sell", "ad_prod", style="dashed")
    s += edge("ad_prod", "ad_rev", style="dashed")
    s += edge("ad_rev", "ad_fraud", style="dashed")
    s += edge("ad_disp", "ad_ref")
    s += edge("ad_ref", "ad_pay")
    s += edge("ad_cat", "ad_cms", style="dashed")
    s += edge("ad_set", "ad_ware", style="dashed")
    s += "}\n"
    return s


GRAPHS = {
    "01_architecture": g_architecture,
    "02_lifecycle":    g_lifecycle,
    "03_ordering":     g_ordering,
    "04_delivery":     g_delivery,
    "05_customer":     g_customer,
    "06_seller":       g_seller,
    "07_rider":        g_rider,
    "08_admin":        g_admin,
}

if __name__ == "__main__":
    from PIL import Image
    for name, fn in GRAPHS.items():
        png = render(name, fn())
        w, h = Image.open(png).size
        print(f"  {name:18s} {w:4d} x {h:4d}px  (h/w={h/w:.2f})")
    print("All diagrams rendered to", OUT)
