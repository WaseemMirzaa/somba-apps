# Payment Terminology Inventory — Somba&Teka Web App

Every payment-related sentence, label, and word across the web app (English + French).
Generated from a full sweep of `web/src`. Grouped by area; "Sentences" = UI/marketing copy,
"Words/labels" = field labels, button text, statuses, data values.

---

## 0. Core payment vocabulary (methods, providers, currency)

| Concept | English | French |
|---|---|---|
| Card (Stripe) | "Stripe — Card", "Card", "Card payment" | "Stripe — Carte", "Carte", "Paiement par carte" |
| Wallet | "Somba&Teka Wallet", "wallet balance", "store credit" | "Portefeuille Somba&Teka", "solde", "crédit en boutique" |
| Mobile money | "Airtel Money", "Orange Money", "Vodacom M-Pesa", "mobile money" | same (+ "mobile money") |
| Bank transfer (payouts) | "Bank Transfer" | "Virement bancaire" |
| Refund target | "Original Payment" | "Paiement d'origine" |
| Currency | "USD", "$" | "CDF", "USD" |

Config (`lib/config.ts`): `PAYMENTS.methods = [stripe_card, airtel_money, orange_money, vodacom_mpesa, wallet]`, `codEnabled: false`; wallet flags `storeCredit / topUpViaMobileMoney / refundToWallet / refundToOriginal`; `MOBILE_MONEY` providers Airtel/Orange/Vodacom; commission rates by category & tier.

---

## 1. Customer shop

### Checkout & payment (`app/shop/checkout`, `…/checkout/payment`)
**Sentences:** "Continue to Payment" / "Continuer vers le paiement" · "Payment Method" / "Mode de paiement" · "Payment failed" / "Échec du paiement" · "Retry payment" / "Réessayer" · "Payment failed — retry" / "Paiement échoué — réessayez" · "Your reservation is held for 15 min." / "Votre réservation est maintenue 15 min." · "Pay" / "Payer" · breadcrumb "Checkout" / "Caisse"
**Methods/labels:** "Stripe — Card" · "Somba&Teka Wallet ($142.50)" · "Airtel Money" · "[Stripe Card Element — mock]" · "Total"

### Cart (`app/shop/cart`)
"Promo code" / "Code promo" · "Apply" / "Appliquer" · "…applied" / "…appliqué" · "Subtotal" / "Sous-total" · "Discount" / "Réduction" · "Delivery (zone)" / "Livraison (zone)" · "FREE" / "GRATUIT" · "Total" · "Continue to Checkout" / "Passer à la caisse"

### Wallet (`app/shop/wallet`)
**Sentences:** "Somba&Teka Wallet" / "Portefeuille Somba&Teka" · "Store credit · Top-up via mobile money · Cashback" / "Crédit en boutique · Recharge via mobile money · Cashback" · "Available Balance" / "Solde disponible" · "Top Up via Airtel" / "Recharger via Airtel" · "Withdraw" / "Retirer" · "Withdrawal request submitted" / "Demande de retrait soumise" · "Top Up Wallet" / "Recharger le portefeuille" · "Amount (USD)" / "Montant (USD)" · "Airtel Money number" / "Numéro Airtel Money" · "Confirm Top-up" / "Confirmer la recharge" · "Wallet topped up +$50" / "Portefeuille rechargé +$50" · "Transaction History" / "Historique des transactions"
**Transaction descriptions:** "…cashback" / "Cashback commande…" · "Checkout payment" / "Paiement à la commande" · "Airtel Money top-up" / "Recharge Airtel Money" · "Return … refund to wallet" / "Remboursement retour … vers le portefeuille"

### Orders & refunds (`app/shop/orders`, `…/[id]`, `…/[id]/return`, `…/returns/[id]`)
"Payment" column / "Paiement" · payment status: paid→"Payé", refunded→"Remboursé", pending→"En attente" · detail labels "Method"/"Moyen", "Transaction", "Status"/"Statut", "Amount"/"Montant" · "Refund method: Original payment (Card/Airtel Money)" / "Mode de remboursement : Paiement d'origine (Carte/Airtel Money)" · "Refunded" / "Remboursé" · "Refund" / "Remboursement"

### Referral / account / support / product
"earn wallet credit on their first order" / "gagnez du crédit portefeuille…" · "Give $10, Get $10" · "$10 wallet credit" · account menu "Payment methods → Somba&Teka Wallet · Airtel top-up" · support placeholder "Order issue, return, payment…" / "…retour, paiement…" · product "Wallet cashback" / "Remboursement portefeuille" · purchase CTA "…add to cart, checkout, and track…" / "…ajouter au panier, payer…"

---

## 2. Seller — Finance

### Finance dashboard (`app/seller/finance`)
**KPIs:** Revenue/Revenus · Pending Revenue/Revenus en attente · Available Balance/Solde disponible · Commission Paid/Commissions payées · Refund Amount/Montant remboursé
**Sentence:** "Earnings accrue after delivery confirmation and warehouse reconciliation, then a 48h clearance period." / "Les gains sont versés après confirmation de livraison et réconciliation entrepôt, puis un délai de sécurisation de 48h."
**Labels:** Revenue Trend · Revenue by Category · Recent Transactions/Transactions récentes · Gross/Brut · Commission · Net · Pending Clearance & Payout/Versements en attente · Recent Payouts/Derniers versements · Commission Breakdown/Répartition des commissions · Tier/Palier · Rate/Taux

### Payouts (`…/finance/payouts`, `/request`, `/pending`, `/[id]`)
"Payouts"/"Versements" · "Request Payout"/"Demander un versement" · "Payout Requested"/"Versement demandé" · "PAY-REQ-… — Processing in 2-3 business days"/"…Traitement sous 2 à 3 jours ouvrés" · "Amount (USD)" · "Bank Name"/"Nom de la banque" · "IBAN / Account Number" · "Account Holder"/"Titulaire du compte" · "Submit Payout Request"/"Soumettre la demande de versement" · "Total pending"/"Total en attente" · "Available for payout"/"Disponible pour versement" · "Next payout date"/"Prochain versement" · "Commission deducted"/"Commissions déduites" · "Net earnings"/"Gains nets" · statuses awaiting_delivery / pending_clearance / ready_for_payout / paid_out · methods "Bank Transfer"/"Virement bancaire", "Mobile Money"

### Transactions & statements (`…/finance/transactions`, `/statements`)
"Transactions" · Gross/Brut · Commission · Net · Status/Statut · "Statements"/"Relevés" · "Monthly financial statements"/"Relevés financiers mensuels" · "Download PDF"/"Télécharger le PDF"

### Revenue analytics (`app/seller/analytics/revenue`, `…/analytics`)
"Gross revenue (MTD)"/"Revenu brut" · "Net revenue (MTD)"/"Revenu net" · "Commission paid"/"Commissions payées" · "Refunds"/"Remboursements" · "Pending payout"/"Versement en attente" · "Revenue by payment method"/"Revenu par mode de paiement" · "Refund rate"/"Taux de remboursement" · "Net earnings"/"Gains nets" · funnel "Checkout started"/"Paiement démarré" · payment-method split rows: Mobile Money · Card/Carte bancaire · Wallet/Portefeuille

### Subscription & pricing (`app/seller/subscribe`, `app/sell-online/subscribe`, product detail)
"Seller subscription required"/"Abonnement vendeur requis" · "Subscription activated…"/"Abonnement activé…" · "Mock payment for demo. In production, redirects to app or Stripe." / "Paiement simulé pour la démo…" · plan prices "$49 / $99 / Custom", "/mo"/"/mois" · "Card payment"/"Paiement par carte" · "Card number"/"Numéro de carte" · "Billing details"/"Informations de facturation" · "Confirm purchase — $…/mo"/"Confirmer — …/mois" · product "Pricing"/"Tarification", "MRP", "Sale Price"/"Prix de vente", "Commission", "Net Revenue"/"Chiffre d'affaires net"

---

## 3. Admin — Finance & Trust

### Payouts (`app/admin/payouts`)
"Payout approval — N pending · weekly, $10 min, 48h clearance" / "Approbation des versements — N en attente · hebdo, min. 10 $, délai 48 h" · "Payout ID"/"ID paiement" · "Seller"/"Vendeur" · "Method" · statuses Requested/Approved/Rejected/Paid → Demandé/Approuvé/Rejeté/Payé · "Clearance hours"/"Heures de compensation"

### Finance dashboard (`app/admin/finance`)
**Subtitle:** "Revenue, commission, payouts, refunds & settlements" / "Chiffre d'affaires, commissions, versements, remboursements et règlements"
**KPIs:** Gross revenue/Chiffre brut · Net revenue/Revenu net · Commission earned/Commissions · Pending payouts/Versements en attente · Refunds (MTD)/Remboursements · Outstanding/Paiements en souffrance · Tax withheld/Retenue fiscale · Dispute hold/Gel litiges
**Charts:** "Payment methods · Share of collected volume" / "Modes de paiement · Part du volume encaissé" · "Settlement aging"/"Ancienneté des règlements" · "Cash flow · Gross → net to platform"/"Flux de trésorerie · Du brut au net plateforme" · "Top refund reasons"/"Motifs de remboursement"
**Transaction types:** Order Payment/Paiement de commande · Seller Payout/Versement vendeur · Refund/Remboursement · Payment Settlement/Règlement de paiement

### Refunds (`app/admin/refunds`)
"Refund Authorisation"/"Autorisation de remboursement" · "AF-15 — Authorise pending refunds before payout"/"AF-15 — Valider les remboursements en attente" · "N refund(s) pending authorisation"/"N remboursement(s) en attente" · "Authorise Refund"/"Autoriser le remboursement" · methods "Stripe", "Manual — Airtel Money"/"Manuel — Airtel Money" · reason data "Refund via Airtel"/"Remboursement via Airtel"

### Order / dispute / return detail (`admin/orders/[id]`, `disputes/[id]`, `returns/[id]`)
"Payment"/"Paiement" section · "Gateway"/"Passerelle" (Stripe) · "Transaction ID"/"ID transaction" · "Payment Status"/"Statut du paiement" · "Amount"/"Montant" · "Commission" · "Seller Earnings"/"Gains du vendeur" · "Refunds"/"Remboursements" · status map paid/refunded/pending

### Fraud (`app/admin/fraud`)
"Fraud & Payment Risk"/"Fraude et risque de paiement" · fraud types "Payment risk"/"Risque de paiement", "OTP fail"/"Échec OTP", "Velocity"/"Vélocité", "Address block"/"Blocage d'adresse"

### Settings / audit / seller detail
Settings: "Commission (Δ4)", "Default commission %"/"Commission par défaut %", "Payouts (Δ4)"/"Versements", "Min payout (USD)"/"Versement min.", "Clearance hours"/"Heures de compensation", "USD → CDF" · Audit: "PROCESS_PAYOUT"→"Traiter le versement", entity "Payout"/"Versement" · Seller detail: "Available / Pending / Paid Balance" (Solde disponible / en attente / versé), "Commission Rate"/"Taux de commission", "Balance & Transactions"/"Solde et transactions"

### Admin libs
- `admin-i18n.ts` permission scopes: Payouts/Versements · Refunds/Remboursements · Payment reconciliation/Réconciliation des paiements · Payments/Paiements
- `finance-analytics.ts`: payment-method split (Card (Stripe), Airtel Money, Orange Money, Vodacom M-Pesa, Wallet) · settlement aging buckets · cash-flow stages (Gross revenue → After payouts → After refunds → After tax withheld → Net to platform) · refund reasons (Not as described / Defective / Wrong item / Late delivery / Changed mind)
- `support-tickets.ts`: "Refund delay"/"Retard de remboursement" ("It's been 10 days and my refund hasn't arrived." / "…the refund was issued to your wallet…") · "Payment failed"/"Paiement échoué" ("My card was charged twice for one order." / "Ma carte a été débitée deux fois…") · "Payout delay inquiry"/"Demande de retard de versement" ("My payout for last week is still pending…")
- `admin-analytics.ts`: "Payment reconciliation"/"Rapprochement paiements" · "paymentHealthScore" · "Payout batch PAY-2406 approved — $84,200" · "Payment fraud flag — ORD-2024-112 · $420 high-value order" · "Payout hold — 3 sellers"/"Versements bloqués — 3 vendeurs"

---

## 4. Warehouse & Rider — payment collection (operational)

> Note: customer "pay at delivery" was removed (PR #49) and `codEnabled = false`; these are the staff-side
> "payment collection / reconciliation" features. `codAmount` is mostly 0 now, but the labels remain.

**KPI / headings:** "Payments collected"/"Paiements collectés" (warehouse analytics, warehouse dashboard, rider dashboard) · "Payment collection"/"Encaissement paiement" (rider task type) · "Payment to Collect"/"Paiement à collecter" · "Amount Due / Amount to collect"/"Montant à collecter" · "Cash collected"/"Espèces collectées" · "Confirm payment collection"/"Confirmez la collecte du paiement" · "Collect · $X"/"À encaisser · $X"
**Payment types:** Prepaid/Prépayé · Card/Carte · Cash/Espèces · Mobile money
**Issues:** rider fail reason "Payment issue"/"Problème de paiement" · "Payment mismatch"/"Écart de paiement" (warehouse exception) · "Payment mismatch — BAT-039 · $240 variance"/"Écart paiement — BAT-039 · Écart 240 $"
**COD reconciliation** (`warehouse-entities.ts`): expected / collected / difference / variance fields; shift-reconciliation variance notes ("Rider reported customer on ORD-2024-006 paid $439 instead of $499…" / "Le livreur signale que le client … a payé 439 $ au lieu de 499 $…")
**Refund methods** (warehouse returns): "Somba&Teka Wallet"/"Portefeuille Somba&Teka", "Original Payment"/"Paiement d'origine"

---

## 5. Marketing / landing / legal

**Landing & product-landing.ts:** marquee "Card · Mobile money · Wallet"/"Carte · Mobile money · Portefeuille" · MODULES_SECTION "From checkout to doorstep — payments, delivery, returns…"/"De la commande à la livraison — paiements…" · Secure Payments module "Card or Somba&Teka wallet — fraud-checked checkout with buyer protection on every order."/"Carte ou portefeuille Somba&Teka — paiement vérifié…", highlight "Card + wallet"/"Carte + portefeuille", CTA "See payment options"/"Voir les paiements", "Encrypted checkout"/"Paiement chiffré" · PAYMENT_OPTIONS "Card & Wallet — Pay securely at checkout with saved cards or your Somba&Teka wallet balance."/"Payez en toute sécurité par carte ou portefeuille…" · WHY_CHOOSE "Secure payments — Card and wallet options with buyer protection on every order."/"Carte et portefeuille avec protection acheteur…" · PRODUCT_HERO bullet "Card and wallet"/"Carte et portefeuille", guarantee "Guest checkout"/"Paiement invité" · TRUST_SIGNALS "Secure checkout"/"Paiement sécurisé" · HOW_IT_WORKS "Checkout securely — Pay with card or Somba&Teka wallet…"/"Payer en sécurité — Payez par carte ou portefeuille…" · FAQ "What payment methods are accepted? — We accept credit/debit cards and Somba&Teka wallet balance…"/"Quels moyens de paiement sont acceptés ? — Cartes bancaires et portefeuille Somba&Teka…"

**Seller marketing:** "From $49/mo"/"Dès 49 $/mois" · "Timely payouts — Transparent commission, weekly payouts, and a full finance dashboard…"/"Paiements à temps — Commission transparente, paiements hebdomadaires…" · "Get paid — Track earnings, request payouts…"/"Soyez payé — Suivez vos revenus, demandez des paiements…" · SELL_ONLINE_FAQ "What are the seller fees? — Monthly plans start at $49/mo. Platform commission applies per category (typically 8–15%)…" · "When do I get paid? — Payouts are processed weekly after order delivery and return window."

**get-app:** "Card, wallet & mobile money"/"Carte, portefeuille et mobile money"

**Legal (`app/legal/terms`, `…/privacy`):** §2 "Orders & Payments — We support Stripe card payments, Airtel Money, and the Somba&Teka Wallet."/"Commandes et paiements — Nous acceptons les paiements par carte Stripe, Airtel Money et le portefeuille Somba&Teka." · §3 "Refunds may be issued to the original payment method or Somba&Teka Wallet…"/"Les remboursements peuvent être effectués sur le moyen de paiement d'origine ou sur le portefeuille…" · Privacy "payment details (tokenized)"/"détails de paiement (tokenisés)" · Terms §1 "…facilitates transactions, payments, and logistics…"/"…facilite les transactions, les paiements…"

---

## 6. i18n keys (`lib/i18n.ts`)

`securePaymentsDesc` "Wallet, card & mobile money"/"Portefeuille, carte et mobile money" · `paymentMethods` "Payment Methods"/"Moyens de paiement" · `payouts` "Payouts"/"Paiements" · `requestPayout` "Request Payout"/"Demander paiement" · `refunds` "Refunds"/"Remboursements" · `fraudPayments` "Fraud & Payments"/"Fraude et paiements" · `cod` "Payment Reconciliation"/"Réconciliation des paiements" · `codCollections` "Payment Collections"/"Collectes de paiement"

---

## Recurring payment terms (quick index)

EN: payment · pay · paid · payout · wallet · card · Stripe · mobile money · Airtel/Orange/Vodacom M-Pesa · checkout · cart · transaction · refund · commission · settlement · reconciliation · gateway · balance · top-up · cashback · earnings · gross/net · revenue · fee · tax withheld · outstanding · dispute hold · clearance · subscription · billing · currency (USD/CDF)

FR: paiement · payer · payé · versement · portefeuille · carte · Stripe · mobile money · Airtel/Orange/Vodacom M-Pesa · caisse/paiement · panier · transaction · remboursement · commission · règlement · rapprochement/réconciliation · passerelle · solde · recharge · cashback · gains/revenus · brut/net · frais · retenue fiscale · en souffrance · gel litiges · compensation/sécurisation · abonnement · facturation · devise (USD/CDF)
