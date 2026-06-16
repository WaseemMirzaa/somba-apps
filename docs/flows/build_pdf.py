#!/usr/bin/env python3
"""
Somba & Tekka — System Flows & Process Guide (PDF builder).
Assembles a client-facing PDF: cover, contents, platform overview,
end-to-end lifecycle, and a flowchart + narrative for every portal.

Run:  python3 build_pdf.py   (diagrams must be rendered first: python3 diagrams.py)
"""
import os
from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image,
    PageBreak, Table, TableStyle, NextPageTemplate, KeepTogether, Flowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

HERE = os.path.dirname(os.path.abspath(__file__))
DIAG = os.path.join(HERE, "diagrams")
PDF  = os.path.join(HERE, "Somba-Tekka-System-Flows.pdf")

# ---- Fonts (DejaVu = full unicode: → ≤ · — ✓) ---------------------------
DJV = "/usr/share/fonts/truetype/dejavu"
FRE = "/usr/share/fonts/truetype/freefont"

def _reg(name, *candidates):
    for c in candidates:
        if os.path.exists(c):
            pdfmetrics.registerFont(TTFont(name, c)); return True
    return False

_reg("DJ",  os.path.join(DJV, "DejaVuSans.ttf"))
_reg("DJ-B", os.path.join(DJV, "DejaVuSans-Bold.ttf"))
# regular DejaVu Sans ships without an oblique; fall back to FreeSans oblique, else upright
if not _reg("DJ-O", os.path.join(DJV, "DejaVuSans-Oblique.ttf"), os.path.join(FRE, "FreeSansOblique.ttf")):
    pdfmetrics.registerFont(TTFont("DJ-O", os.path.join(DJV, "DejaVuSans.ttf")))
if not _reg("DJ-BO", os.path.join(DJV, "DejaVuSans-BoldOblique.ttf"), os.path.join(FRE, "FreeSansBoldOblique.ttf")):
    pdfmetrics.registerFont(TTFont("DJ-BO", os.path.join(DJV, "DejaVuSans-Bold.ttf")))
registerFontFamily("DJ", normal="DJ", bold="DJ-B", italic="DJ-O", boldItalic="DJ-BO")

# ---- Colours -------------------------------------------------------------
BRAND   = colors.HexColor("#1d4ed8")
BRAND_DK= colors.HexColor("#1e3a8a")
ACCENT  = colors.HexColor("#0891b2")
INK     = colors.HexColor("#0f172a")
SLATE   = colors.HexColor("#334155")
MUTED   = colors.HexColor("#64748b")
LIGHT   = colors.HexColor("#EAF1FB")
HAIR    = colors.HexColor("#cbd5e1")
A_CUST  = colors.HexColor("#2563eb")
A_SELL  = colors.HexColor("#7c3aed")
A_WARE  = colors.HexColor("#0891b2")
A_RIDE  = colors.HexColor("#059669")
A_ADMN  = colors.HexColor("#b45309")

# ---- Styles --------------------------------------------------------------
ss = getSampleStyleSheet()
def _st(name, **kw):
    base = dict(fontName="DJ", textColor=INK, fontSize=10.2, leading=15)
    base.update(kw)
    return ParagraphStyle(name, **base)

H1   = _st("H1", fontName="DJ-B", fontSize=19, leading=23, textColor=BRAND_DK, spaceBefore=2, spaceAfter=8)
H1P  = _st("H1plain", fontName="DJ-B", fontSize=19, leading=23, textColor=BRAND_DK, spaceBefore=2, spaceAfter=8)
H2   = _st("H2", fontName="DJ-B", fontSize=13.5, leading=18, textColor=BRAND, spaceBefore=12, spaceAfter=5)
H3   = _st("H3", fontName="DJ-B", fontSize=11, leading=15, textColor=SLATE, spaceBefore=8, spaceAfter=3)
BODY = _st("Body", alignment=TA_JUSTIFY, spaceAfter=6)
BULL = _st("Bull", leftIndent=15, bulletIndent=3, spaceAfter=3, leading=14.5)
CAP  = _st("Cap", fontName="DJ-O", fontSize=9, textColor=MUTED, alignment=TA_CENTER, spaceBefore=6)
LEAD = _st("Lead", fontSize=11, leading=16, textColor=SLATE, spaceAfter=8, alignment=TA_JUSTIFY)
TND  = _st("TableD", fontSize=9, leading=12.5)
TNDb = _st("TableDb", fontName="DJ-B", fontSize=9, leading=12.5, textColor=colors.white)
TOC0 = _st("TOC0", fontName="DJ-B", fontSize=11, leading=20, textColor=BRAND_DK)
TOC1 = _st("TOC1", fontSize=10, leading=17, textColor=SLATE, leftIndent=14)


def P(text, style=BODY):
    return Paragraph(text, style)

def B(text):
    """Bullet paragraph."""
    return Paragraph(text, BULL, bulletText="•")

def fig(path, caption, max_w, max_h, figno):
    iw, ih = PILImage.open(path).size
    r = min(max_w / iw, max_h / ih)
    img = Image(path, width=iw * r, height=ih * r)
    img.hAlign = "CENTER"
    return [img, P(f"<b>Figure {figno}</b> — {caption}", CAP)]

def chip_table(rows, header, widths, header_bg=BRAND):
    data = [[Paragraph(h, TNDb) for h in header]]
    for r in rows:
        data.append([Paragraph(str(c), TND) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "DJ-B"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, HAIR),
        ("BOX", (0, 0), (-1, -1), 0.6, HAIR),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


class Rule(Flowable):
    def __init__(self, w, color=HAIR, thick=0.8):
        super().__init__(); self.w = w; self.color = color; self.thick = thick
    def wrap(self, *a): return (self.w, self.thick + 2)
    def draw(self):
        self.canv.setStrokeColor(self.color); self.canv.setLineWidth(self.thick)
        self.canv.line(0, 1, self.w, 1)


# ---- Page furniture ------------------------------------------------------
def cover_page(c, doc):
    w, h = A4
    c.saveState()
    c.setFillColor(BRAND_DK); c.rect(0, h - 300, w, 300, fill=1, stroke=0)
    c.setFillColor(BRAND); c.rect(0, h - 300, w, 14, fill=1, stroke=0)
    c.setFillColor(ACCENT); c.rect(0, h - 314, w, 5, fill=1, stroke=0)
    # brand
    c.setFillColor(colors.white)
    c.setFont("DJ-B", 13); c.drawString(2.0 * cm, h - 2.4 * cm, "SOMBA  &  TEKKA")
    c.setFont("DJ", 10.5); c.setFillColor(colors.HexColor("#bfdbfe"))
    c.drawString(2.0 * cm, h - 3.0 * cm, "Marketplace Platform")
    # title
    c.setFillColor(colors.white)
    c.setFont("DJ-B", 33); c.drawString(2.0 * cm, h - 6.0 * cm, "System Flows &")
    c.drawString(2.0 * cm, h - 7.3 * cm, "Process Guide")
    c.setFont("DJ", 13); c.setFillColor(colors.HexColor("#dbeafe"))
    c.drawString(2.0 * cm, h - 8.5 * cm, "Ordering · Delivery · Customer · Seller · Rider · Super Admin")
    # lower block
    c.setFillColor(SLATE)
    c.setFont("DJ-B", 11); c.drawString(2.0 * cm, 6.6 * cm, "Prepared for the client")
    c.setFont("DJ", 10.5); c.setFillColor(MUTED)
    c.drawString(2.0 * cm, 5.9 * cm, "A visual, plain-language walkthrough of every business flow in the platform,")
    c.drawString(2.0 * cm, 5.4 * cm, "with annotated flowcharts and step-by-step descriptions for each portal.")
    c.drawString(2.0 * cm, 4.5 * cm, "Date:  16 June 2026")
    c.drawString(2.0 * cm, 4.0 * cm, "Document:  Functional flow documentation (v1)")
    # portal chips
    chips = [("Customer", A_CUST), ("Seller", A_SELL), ("Warehouse", A_WARE),
             ("Rider", A_RIDE), ("Super Admin", A_ADMN)]
    x = 2.0 * cm
    c.setFont("DJ-B", 8.5)
    for label, col in chips:
        tw = c.stringWidth(label, "DJ-B", 8.5) + 16
        c.setFillColor(col); c.roundRect(x, 2.7 * cm, tw, 0.62 * cm, 4, fill=1, stroke=0)
        c.setFillColor(colors.white); c.drawString(x + 8, 2.88 * cm, label)
        x += tw + 7
    c.setStrokeColor(HAIR); c.setLineWidth(0.8); c.line(2.0 * cm, 1.9 * cm, w - 2.0 * cm, 1.9 * cm)
    c.setFillColor(MUTED); c.setFont("DJ", 8)
    c.drawString(2.0 * cm, 1.5 * cm, "Confidential — prototype documentation. Built on mock data; no live backend, payments or notifications.")
    c.restoreState()


def _footer(c, doc, orient="portrait"):
    w, h = landscape(A4) if orient == "landscape" else A4
    c.saveState()
    c.setStrokeColor(HAIR); c.setLineWidth(0.6)
    c.line(1.7 * cm, 1.25 * cm, w - 1.7 * cm, 1.25 * cm)
    c.setFont("DJ", 8); c.setFillColor(MUTED)
    c.drawString(1.7 * cm, 0.95 * cm, "Somba & Tekka — System Flows & Process Guide")
    c.drawRightString(w - 1.7 * cm, 0.95 * cm, f"Page {doc.page}")
    c.setFillColor(BRAND); c.rect(1.7 * cm, 1.30 * cm, 2.2 * cm, 2.2, fill=1, stroke=0)
    c.restoreState()

def portrait_page(c, doc):  _footer(c, doc, "portrait")
def landscape_page(c, doc): _footer(c, doc, "landscape")


class FlowDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            st = flowable.style.name
            if st == "H1":
                self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))
            elif st == "H2":
                self.notify("TOCEntry", (1, flowable.getPlainText(), self.page))


def build():
    pw, ph = A4
    lw, lh = landscape(A4)
    fp = Frame(1.7 * cm, 1.5 * cm, pw - 3.4 * cm, ph - 3.4 * cm, id="p")
    fl = Frame(1.6 * cm, 1.5 * cm, lw - 3.2 * cm, lh - 3.0 * cm, id="l")
    fc = Frame(0, 0, pw, ph, id="c")
    doc = FlowDoc(PDF, pagesize=A4, title="Somba & Tekka — System Flows & Process Guide",
                  author="Somba & Tekka")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[fc], onPage=cover_page, pagesize=A4),
        PageTemplate(id="portrait", frames=[fp], onPage=portrait_page, pagesize=A4),
        PageTemplate(id="landscape", frames=[fl], onPage=landscape_page, pagesize=landscape(A4)),
    ])

    FW = pw - 3.4 * cm          # portrait usable width
    FIGW, FIGH = FW, 19.5 * cm  # portrait figure box
    LFIGW, LFIGH = lw - 3.6 * cm, lh - 3.4 * cm

    story = []
    # ---------- COVER ----------
    story += [NextPageTemplate("portrait"), PageBreak()]

    # ---------- CONTENTS ----------
    story += [P("Contents", H1P), Rule(FW, BRAND, 1.2), Spacer(1, 8)]
    toc = TableOfContents()
    toc.levelStyles = [TOC0, TOC1]
    toc.dotsMinLevel = 0
    story += [toc, PageBreak()]

    # =====================================================================
    # 1. PLATFORM OVERVIEW
    # =====================================================================
    story += [P("1. Platform Overview", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "<b>Somba &amp; Tekka</b> is a Flipkart-style online marketplace where many independent "
        "sellers list products and the platform coordinates payment, warehousing and last-mile "
        "delivery. The product is delivered as <b>six role-based portals</b> that share one codebase, "
        "plus two native mobile apps. Everyone signs in through a single door and is routed to the "
        "portal that matches their role.", LEAD)]

    story += [P("The six portals", H2)]
    story += [
        B("<b>Customer Shop</b> (<font face='DJ-B'>/shop</font>) — browse, buy, track orders, returns, wallet. Also a Flutter mobile app."),
        B("<b>Seller Portal</b> (<font face='DJ-B'>/seller</font>) — list products, fulfil orders, manage finances and payouts."),
        B("<b>Warehouse Portal</b> (<font face='DJ-B'>/warehouse</font>) — receive, sort, batch and dispatch parcels; handle returns and exceptions."),
        B("<b>Rider Portal</b> (<font face='DJ-B'>/rider</font>) — accept delivery tasks, navigate, capture proof of delivery. Also a Flutter app."),
        B("<b>Super Admin</b> (<font face='DJ-B'>/admin</font>) — govern the whole marketplace: approvals, money, catalog, settings, oversight."),
        B("<b>Landing &amp; Auth</b> (<font face='DJ-B'>/</font>, <font face='DJ-B'>/login</font>) — marketing entry and the shared sign-in for all 11 personas."),
    ]

    story += [P("Key business rules baked into the flows", H2)]
    story += [
        B("<b>Dual market, one codebase</b> — a <b>France</b> profile (demo, USD) and a <b>DRC</b> profile "
          "(Kinshasa / Lubumbashi, USD with a manual USD→CDF rate). Every screen is bilingual <b>English / French</b>."),
        B("<b>Seller-owned inventory, hybrid fulfilment</b> — goods can ship from the seller or from a platform "
          "warehouse. <b>Cross-city</b> and <b>open-box</b> delivery are supported."),
        B("<b>Commission</b> is category-tiered (<b>8–15%</b>) with seller-tier discounts; seller earnings clear "
          "after delivery + warehouse reconciliation + a <b>48-hour</b> hold."),
        B("<b>Payments are prepaid</b> — Stripe card, Airtel Money (mobile money) and the in-app <b>Somba Wallet</b>. "
          "<i>Cash on Delivery is not offered</i> — every order is paid before dispatch. Refunds go back to the "
          "original method or to the wallet."),
        B("<b>Prototype scope</b> — the system runs on realistic <b>mock data</b>; there is no live backend, real "
          "payment capture or push notifications yet. The flows below describe the intended production behaviour."),
    ]
    story += [Spacer(1, 4), P(
        "<b>Technology.</b> All six portals are one Next.js web application; a NestJS service provides a mock API; "
        "the customer and rider mobile apps are built in Flutter; and a shared library holds the screen registry, "
        "market profiles and the status definitions that every portal agrees on.", BODY)]

    # architecture figure on a landscape page
    story += [NextPageTemplate("landscape"), PageBreak()]
    story += fig(os.path.join(DIAG, "01_architecture.png"),
                 "System architecture — six portals share React contexts and a mock API/data layer.",
                 LFIGW, LFIGH, 1)
    story += [NextPageTemplate("portrait"), PageBreak()]

    # =====================================================================
    # 2. END-TO-END ORDER LIFECYCLE
    # =====================================================================
    story += [P("2. End-to-End Order Lifecycle", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "This is the single most important journey: how one order travels across <b>all</b> portals, from the "
        "customer tapping “buy” to the seller being paid. Each colour in the flowchart is a different actor "
        "(customer, seller, warehouse, rider, admin), so the hand-offs between teams are easy to see.", LEAD)]
    story += [P("How an order moves", H2)]
    story += [
        B("<b>Customer</b> places and pays for an order. Status goes <b>pending → confirmed</b>."),
        B("<b>Seller</b> receives the order, accepts it (<b>processing</b>) and marks the package ready for pickup."),
        B("<b>Warehouse</b> takes the parcel inbound, receives and scans it, sorts it to a zone (<b>ready</b>), then "
          "builds a delivery batch."),
        B("<b>Warehouse</b> assigns a rider and dispatches the batch. Order goes <b>shipped → out for delivery</b>."),
        B("<b>Rider</b> picks up, navigates to the customer and attempts delivery — the key decision point."),
        B("On success the rider captures <b>proof of delivery</b> (OTP and photo / signature); order becomes "
          "<b>delivered</b>. On failure the reason is logged and the parcel returns for re-dispatch."),
        B("<b>Seller</b> earnings clear (48h) and a payout is requested; <b>Super Admin</b> approves it and it is "
          "marked <b>paid</b> — the order is fully settled."),
        B("At any point after delivery the customer may open a <b>return, exchange or dispute</b>, which the seller "
          "and admin resolve, with the admin authorising any <b>refund</b>."),
    ]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "02_lifecycle.png"),
                 "End-to-end order lifecycle across all portals (colour = responsible actor).",
                 FIGW, 21.2 * cm, 2)
    story += [PageBreak()]

    # =====================================================================
    # 3. ORDERING FLOW
    # =====================================================================
    story += [P("3. Ordering Flow", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "The ordering flow is the customer’s purchase funnel — everything from opening a product to a confirmed "
        "order. The checkout is a guided <b>four-step</b> process and the system applies market rules "
        "(such as zone delivery fees) as the customer proceeds. Every order is <b>paid up front</b>.", LEAD)]
    story += [P("Step by step", H2)]
    story += [
        B("<b>Discover &amp; add to cart</b> — from a product page the customer can pick a variant, check delivery "
          "to their pincode/zone, read Q&amp;A and reviews, then add to the cart. The cart groups items by seller "
          "and supports quantities and “save for later”."),
        B("<b>Promo code</b> (optional) — codes such as <b>SOMBA10</b> (10% off over $50) or <b>SAVE20</b> ($20 off "
          "over $100) apply when the minimum-order rule is met."),
        B("<b>Sign in or guest</b> — the customer can log in or check out as a guest with just an email."),
        B("<b>Step 1 · Address</b> — choosing the delivery address sets the <b>zone delivery fee</b> automatically."),
        B("<b>Step 2 · Options</b> — cross-city delivery, open-box delivery and an order note."),
        B("<b>Step 3 · Payment (prepaid)</b> — the order is paid before dispatch by card, the <b>Somba Wallet</b> or "
          "<b>Airtel Money</b> (mobile money). There is no cash-on-delivery option, so no order leaves the warehouse unpaid."),
        B("<b>Payment outcome</b> — if a payment fails the reservation is held for <b>15 minutes</b> and the "
          "customer can retry. On success the order is confirmed."),
        B("<b>Step 4 · Confirmation</b> — the order is created with status <b>processing</b> and live tracking "
          "becomes available."),
    ]
    story += [Spacer(1, 4), P("Payment methods at a glance (all prepaid)", H3)]
    story += [chip_table(
        [["Stripe card", "Card payment (mock Stripe element)", "All orders"],
         ["Somba Wallet", "Store credit; top-up via Airtel Money", "Up to balance"],
         ["Airtel Money", "Mobile money, phone-number entry", "All orders"]],
        ["Method", "How it works", "Availability"], [4.1 * cm, 8.6 * cm, 3.6 * cm])]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "03_ordering.png"),
                 "Ordering flow — browse to confirmed order, with promo, guest and prepaid payment-retry branches.",
                 FIGW, 21.2 * cm, 3)
    story += [PageBreak()]

    # =====================================================================
    # 4. DELIVERY & FULFILMENT
    # =====================================================================
    story += [P("4. Delivery &amp; Fulfilment Flow", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "Once an order is paid, the operations side takes over. This flow has two halves: the <b>warehouse</b> "
        "prepares and dispatches parcels, and the <b>rider</b> completes the last mile. The same warehouse screens "
        "are also visible to the Super Admin under <i>Fulfilment</i>, and the platform supports <b>multiple hubs</b>.", LEAD)]
    story += [P("Warehouse operations", H2)]
    story += [
        B("<b>Inbound</b> — parcels collected from sellers arrive at the hub."),
        B("<b>Receiving</b> — staff scan the barcode and inspect. If inspection fails, an <b>exception/incident</b> "
          "is raised (damaged, missing item, count mismatch)."),
        B("<b>Sorting</b> — the parcel is assigned to a delivery zone and becomes <b>ready</b>."),
        B("<b>Batch builder</b> — ready parcels are grouped into a delivery batch and the route is optimised."),
        B("<b>Assign rider</b> — the system suggests the <b>nearest available rider</b> (or staff pick manually)."),
        B("<b>Dispatch</b> — the batch is handed to the rider; the order moves to <b>out for delivery</b>."),
    ]
    story += [P("Rider last mile", H2)]
    story += [
        B("<b>Pick up &amp; navigate</b> — the rider collects the batch (status <b>in transit</b>) and is guided "
          "stop-by-stop, able to call the customer."),
        B("<b>Proof of delivery</b> — on arrival the rider verifies the OTP, captures a photo/signature and performs "
          "the open-box check where required (orders are already paid, so no cash changes hands)."),
        B("<b>Outcome</b> — success marks the order <b>delivered</b>; a failed attempt logs a reason and the parcel "
          "is returned for re-dispatch."),
    ]
    story += [P("Exceptions", H2)]
    story += [
        B("<b>Incidents</b> — damage, missing items or count mismatches raise an exception that is investigated and "
          "resolved before the parcel continues."),
        B("<b>Aged parcels</b> — anything stuck beyond ~72 hours is flagged and escalated."),
    ]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "04_delivery.png"),
                 "Delivery & fulfilment — warehouse intake to dispatch, then the rider’s last mile to a delivered order.",
                 FIGW, 21.2 * cm, 4)
    story += [PageBreak()]

    # =====================================================================
    # 5. CUSTOMER PORTAL
    # =====================================================================
    story += [P("5. Customer Portal", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "The customer portal (web at <b>/shop</b> plus a Flutter app) is organised into five areas that map to a "
        "shopper’s journey: <b>account</b>, <b>discover</b>, <b>buy</b>, <b>after-purchase</b> and the <b>account "
        "hub</b>. The ordering funnel in section 3 lives inside the “buy” area.", LEAD)]
    story += [
        B("<b>Account &amp; auth</b> — register → OTP → verify email, plus login and forgot/reset password."),
        B("<b>Discover</b> — a personalised home feed (buy-again, recently viewed), search with autocomplete, "
          "category browsing and rich filters, product and store pages with Q&amp;A, reviews and store-follow, "
          "wishlist and a flash-deals hub."),
        B("<b>Buy</b> — cart with promo codes, the four-step checkout, and order confirmation."),
        B("<b>After purchase</b> — order history, <b>live per-parcel tracking</b> with map, one-tap reorder, and "
          "return / exchange / dispute requests with a support ticket channel."),
        B("<b>Account hub</b> — the <b>Somba Wallet</b> (top-up and transaction history), <b>Refer &amp; Earn</b> "
          "($10 / $10), address book, notification centre, and help including account deletion."),
    ]
    story += [Spacer(1, 4), P(
        "Returns move through <b>requested → approved → in transit → received → refunded</b> (or rejected); disputes "
        "move through <b>open → seller responded → resolved → closed</b>. Both keep the customer informed at every "
        "status change.", BODY)]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "05_customer.png"),
                 "Customer portal — the shopper journey from account and discovery through to after-purchase care.",
                 FIGW, 20.8 * cm, 5)
    story += [PageBreak()]

    # =====================================================================
    # 6. SELLER PORTAL
    # =====================================================================
    story += [P("6. Seller Portal", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "The seller portal is where a merchant runs their storefront: getting approved, listing products, fulfilling "
        "orders and getting paid. Listings and promotions pass through admin moderation before going live, which "
        "keeps catalog quality high.", LEAD)]
    story += [P("From sign-up to selling", H2)]
    story += [
        B("<b>Onboarding</b> — from the sell-online landing the merchant chooses a plan and subscribes, registers "
          "their business (lightweight, <b>no KYC</b> in the prototype), and lands in a <b>pending approval</b> "
          "state. The admin approves, or the seller resubmits corrections."),
        B("<b>Dashboard</b> — once approved, KPIs, a store-health badge (Gold / Silver / Bronze / Somba Assured) and "
          "a finance snapshot."),
        B("<b>Catalog</b> — a guided <b>7-step product wizard</b> (basics → media → variants → inventory → pricing → "
          "shipping → review). On submit the product enters moderation (<b>draft → pending → approved/live</b>). "
          "Bulk CSV import/export and a flag-unavailable action are available."),
        B("<b>Fulfilment</b> — new orders are accepted (<b>processing</b>) and marked ready; the package is handed "
          "to the warehouse and tracked. Returns, replacements and disputes are handled here too."),
        B("<b>Money &amp; growth</b> — transactions show commission (8–15%); earnings clear after delivery, "
          "reconciliation and a 48-hour hold, after which the seller <b>requests a payout</b> for admin approval. "
          "Storefront design, promotions, analytics and review replies round out the portal."),
    ]
    story += [Spacer(1, 4), P("Seller payout — money states", H3)]
    story += [chip_table(
        [["awaiting_delivery", "Order not yet delivered"],
         ["pending_clearance", "Delivered; inside the 48h clearance window"],
         ["ready_for_payout", "Cleared and available to withdraw"],
         ["paid_out", "Included in an approved, paid payout"]],
        ["Earning status", "Meaning"], [5.2 * cm, 11.1 * cm])]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "06_seller.png"),
                 "Seller portal — onboarding, catalog and moderation, order fulfilment, and the payout pipeline.",
                 FIGW, 20.8 * cm, 6)
    story += [PageBreak()]

    # =====================================================================
    # 7. RIDER PORTAL
    # =====================================================================
    story += [P("7. Rider Portal", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "The rider portal (web at <b>/rider</b> plus a Flutter app) is the delivery agent’s daily tool. It is built "
        "around a clear task lifecycle and a structured <b>proof-of-delivery</b> step that protects both the "
        "customer and the platform. Because every order is prepaid, the rider never handles cash.", LEAD)]
    story += [P("A rider’s day", H2)]
    story += [
        B("<b>Sign in &amp; go on-duty</b> — on first login the rider sets a password, then toggles availability to "
          "start receiving work."),
        B("<b>Receive &amp; open tasks</b> — a <i>task-assigned</i> notification leads to the task list and a "
          "<b>batch overview</b> showing ordered stops; each task detail shows the order, customer and notes."),
        B("<b>Navigate &amp; pick up</b> — map navigation and one-tap call; the task moves "
          "<b>assigned → picked&nbsp;up → in&nbsp;transit</b>."),
        B("<b>Proof of delivery</b> — enter the OTP and recipient name, capture a photo/signature and complete the "
          "open-box check where required. The order becomes <b>delivered</b>."),
        B("<b>Failed delivery</b> — if it cannot be completed, the rider logs a reason (customer unavailable, wrong "
          "address, refused, other) and the parcel returns to the warehouse."),
        B("<b>End of shift</b> — an earnings view shows per-delivery pay plus incentives, with shift history."),
    ]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "07_rider.png"),
                 "Rider portal — from going on-duty through navigation and proof of delivery to a delivered order.",
                 FIGW, 21.2 * cm, 7)
    story += [PageBreak()]

    # =====================================================================
    # 8. SUPER ADMIN
    # =====================================================================
    story += [P("8. Super Admin Portal", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P(
        "The Super Admin portal governs the entire marketplace. Access is divided into <b>six sub-roles</b> "
        "(role-based access control), and <b>every action is recorded in an audit log</b> with before/after values, "
        "so the platform always has an accountable trail.", LEAD)]
    story += [P("What the admin governs", H2)]
    story += [
        B("<b>Trust &amp; approvals</b> — approve or reject sellers; moderate products "
          "(<b>approve / reject / request changes</b>) and reviews; and triage fraud &amp; risk alerts "
          "(velocity, address blocks, OTP failures) through <b>open → reviewed → blocked</b>."),
        B("<b>Money</b> — resolve disputes in favour of buyer or seller; authorise refunds (to original method or "
          "wallet); and approve seller payouts (<b>requested → approved → paid</b>, $10 minimum, 48-hour clearance)."),
        B("<b>Catalog, marketing &amp; platform</b> — categories and commission rules, flash sales and "
          "seller-promotion approvals, CMS homepage blocks and broadcasts; plus platform <b>settings</b> "
          "(dual-market, FX rate, delivery fees), delivery <b>zones</b>, and <b>warehouse</b> creation with "
          "auto-generated portal credentials."),
        B("<b>Oversight</b> — the audit log, an analytics suite (GMV, orders, sellers, SLAs, marketplace health), and "
          "read-through into orders, customers and platform finance."),
    ]
    story += [Spacer(1, 4), P("The six admin sub-roles", H3)]
    story += [chip_table(
        [["Operations", "Orders, warehouse, logistics"],
         ["Finance", "Payouts, refunds, reports"],
         ["Support", "Tickets, customers, returns"],
         ["Marketing", "Campaigns, CMS, coupons, banners"],
         ["Moderation", "Products, reviews, sellers"],
         ["Warehouse", "Inventory, dispatch, hubs"]],
        ["Sub-role", "Primary responsibilities"], [4.4 * cm, 11.9 * cm], header_bg=A_ADMN)]
    story += [PageBreak()]
    story += fig(os.path.join(DIAG, "08_admin.png"),
                 "Super Admin — governance grouped into trust & approvals, money, platform, and oversight.",
                 FIGW, 19.5 * cm, 8)
    story += [PageBreak()]

    # =====================================================================
    # APPENDIX — STATUS REFERENCE
    # =====================================================================
    story += [P("Appendix · Status Reference", H1), Rule(FW, BRAND, 1.2), Spacer(1, 6)]
    story += [P("The lifecycle “states” used throughout the portals, collected for quick reference.", LEAD)]

    story += [P("Order status", H3)]
    story += [chip_table(
        [["pending → confirmed", "Placed; payment confirmed"],
         ["processing", "Seller accepted / preparing"],
         ["shipped → out_for_delivery", "Dispatched; rider en route"],
         ["delivered", "Completed at the customer"],
         ["cancelled / returned", "Cancelled before delivery / returned after"]],
        ["State", "Meaning"], [6.8 * cm, 9.5 * cm])]

    story += [P("Parcel &amp; delivery status (warehouse + rider)", H3)]
    story += [chip_table(
        [["inbound → received", "Arrived at hub; scanned in"],
         ["sorting → ready", "Zoned; ready for a batch"],
         ["dispatched", "Handed to a rider in a batch"],
         ["in_transit → out_for_delivery", "Rider carrying / delivering"],
         ["delivered / failed", "Completed / attempt failed (re-dispatch)"]],
        ["State", "Meaning"], [6.8 * cm, 9.5 * cm], header_bg=A_WARE)]

    story += [P("Return, dispute &amp; fraud status", H3)]
    story += [chip_table(
        [["Return", "requested → approved → in_transit → received → refunded (or rejected)"],
         ["Dispute", "open → seller_responded → resolved → closed"],
         ["Fraud alert", "open → reviewed → blocked   (severity: low / medium / high)"]],
        ["Object", "State progression"], [3.4 * cm, 12.9 * cm], header_bg=A_ADMN)]

    story += [Spacer(1, 10), Rule(FW, HAIR, 0.8), Spacer(1, 4)]
    story += [P("<i>Prepared from a full review of the application’s portals, shared contracts and mock data. "
                "Flows describe intended production behaviour; the current build runs on mock data.</i>",
                _st("end", fontName="DJ-O", fontSize=8.5, textColor=MUTED, alignment=TA_CENTER))]

    doc.multiBuild(story)
    print("PDF written:", PDF, "(%.0f KB)" % (os.path.getsize(PDF) / 1024))


if __name__ == "__main__":
    build()
