# Somba&Teka — Customer App Screens

Full screen-by-screen captures of every customer-app flow (390×844 @2x),
regenerated from the current build. Individual screens live in
[`flows/`](flows/); the grouped contact sheets below index them.

## 🎬 Complete flow video — live screen recording (French)

A real screen recording of the running app in French, driven like a normal user
with a moving cursor: typing the sign-in, scrolling the home feed, opening a
product and scrolling its details, adding it to the cart, then a **complete
checkout** — cart → review (address + payment) → order summary → **order
confirmation** ("Commande passée !"). Every scrollable screen is shown in motion.

<video src="https://raw.githubusercontent.com/WaseemMirzaa/somba-apps/claude/customer-app-cicd-ui-xjwzda/mobile/docs/screenshots/customer-live-fr.webm" controls muted width="320"></video>

▶ **[Play / download the flow video (customer-live-fr.webm)](customer-live-fr.webm)**
— if the inline player doesn't load in your Markdown viewer, open the file link
(GitHub shows a built-in player). After PR #79 merges, replace the branch name in
the URL with `main`.

## Auth & onboarding
![Auth & onboarding](01-auth-contact-sheet.png)

Splash · Login · Register · OTP · Verify email · Forgot password · Reset password

The shorter flows — number verification, email verification, forgot password
and set-a-new-password — are vertically centered for a balanced, premium layout.

## Shopping & discovery
![Shopping & discovery](02-shopping-contact-sheet.png)

Home · Categories · Search · Stores & sellers · Store front · Store chat ·
Product list · Product detail · Product detail (dual-currency) · Deals ·
Coupons · Wishlist

Home, Categories and Account are shown inside the app shell with the floating
bottom navigation bar.

## Cart, checkout & payments
![Cart, checkout & payments](03-checkout-contact-sheet.png)

Cart (multi-store) · Checkout · Order summary · Add card · Payment · Payment failed

## Orders, returns & reviews
![Orders, returns & reviews](04-orders-contact-sheet.png)

Orders · Order detail · Order tracking · Returns & exchanges · Return request ·
Return status · Exchange · Dispute · Write a review · Reviews

## Account & support
![Account & support](05-account-contact-sheet.png)

Account · Edit profile · Settings · Addresses · Choose address · Location picker ·
Address form · Notifications · Refer & earn · Support · New ticket · Ticket detail ·
Help · Delete account

## Filter & sort popups
![Filter & sort popups](06-filters-contact-sheet.png)

The AliExpress-style filter sheet (default and with filters applied): sort,
category, price range, minimum rating, deals-only, and a live result count.

---

### Full-screen catalogs (one image per screen — for the client)

- **English:** [`flows/README.md`](flows/README.md)
- **French:** [`fr/README.md`](fr/README.md) · [`flows-fr/README.md`](flows-fr/README.md)

All screens are localized (English / French) and functional in the mock build.
