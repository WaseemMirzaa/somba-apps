# Demo data: add it, use it, remove it

This puts a complete set of test data on a running KOMORIKO server, so you can try the customer app and the seller portal (and the admin and warehouse portals) with real-looking stores, orders and messages.

- It only **adds**. It never wipes anything, never touches your real admin, your real warehouse or the geography, and never changes a setting, with one opt-in exception: `--with-express` switches express delivery on (see "Express delivery" below).
- Run it twice and the second run adds nothing.
- One command removes it again, and leaves your real customers, orders and stores exactly as they were.

**Remove the demo before real orders start.** While it is installed the second demo warehouse (Entrepôt Maluku, démo) serves the commune of Maluku, so a real customer pinned there is routed to it.

**While the demo is installed, real visitors can see it.** The demo stores and products show in the shop, and a real customer could add a demo product to a cart. The demo also sends notices to your real admins (new orders, new products to review). Install it for testing and remove it before you launch.

**The demo super admin (`admin.super@demo.komoriko.test`) can do everything, including creating staff. Remove the demo before launch.**

Everything the demo creates belongs to an account with an e-mail ending in `@demo.komoriko.test`. That is how the removal finds it.

A server seeded before the rename to KOMORIKO has its demo accounts on `@demo.sombateka.test`. The next `seed-demo.sh seed` moves them to `@demo.komoriko.test` (same name before the @, same passwords, no second set of accounts) and writes the new addresses to `/etc/somba/demo-credentials.txt`. The removal and `seed-demo.sh code EMAIL` accept both domains.

## Before you start

- The server was deployed with `deploy/droplet-deploy.sh`, which already ran the bootstrap (settings, categories, geography, the launch warehouse "Entrepôt Kinshasa", your admin). If not, the script stops and tells you.
- The demo is written for the live settings: verified account needed to check out, pinned addresses, seller pickup pin, product moderation, delivery code, split delivery after 24 hours. It does not change them. If one differs, it prints a warning and goes on.
- It pays every demo order with the **wallet**. No card, no mobile money.

## Commands (on the server, as root, in this order)

**First deploy `main` with this change.** `seed-demo.sh` runs the compiled code in `/opt/somba/api/dist`, so a plain `git pull` is not enough (it does not rebuild). Run the normal deploy, the same one you used before. It is safe on a server that already runs: your admin is left unchanged, secrets are kept, data is kept.

```bash
curl -fsSL https://raw.githubusercontent.com/waseemmirzaa/somba-apps/main/deploy/droplet-deploy.sh -o deploy.sh
DOMAIN=komoriko.com ADMIN_EMAIL=<your admin e-mail> bash deploy.sh
```

Then, from the same shell:

```bash
bash /opt/somba/deploy/seed-demo.sh  # add the demo (about 30 seconds); reloads the API at the end
sudo cat /etc/somba/demo-credentials.txt   # every account, its password, its two-factor key
```

| What you want | Command |
|---|---|
| Add the demo and also switch **express delivery** on (see "Express delivery") | `bash /opt/somba/deploy/seed-demo.sh --with-express` |
| Give every demo account a new password | `bash /opt/somba/deploy/seed-demo.sh reset` |
| Choose the password yourself (12+ characters) | `DEMO_PASSWORD='your-long-password' bash /opt/somba/deploy/seed-demo.sh reset` |
| See the current two-factor code of an account | `bash /opt/somba/deploy/seed-demo.sh code seller.a@demo.komoriko.test` |
| See what a removal would delete (changes nothing) | `bash /opt/somba/deploy/seed-demo.sh remove` |
| Remove the demo | `bash /opt/somba/deploy/seed-demo.sh remove --yes` |
| Refresh the dates (see "Time") | remove with `--yes`, then add again |

Customers and store owners share one random password (the one you may hand to a client). Staff (all six admins, warehouse, riders) share a different one. `DEMO_PASSWORD` instead sets one password for everyone.

The credentials file is readable by root only (mode 600). It is never in git and never printed by the script. Run the add again later and accounts that exist keep their password; only `reset` changes them.

**Two-factor is OFF on every demo account by default**: a client signs in with the password only. Running the seed again also switches it off on accounts that had it from an earlier run.

To get two-factor on the demo (all six admins and the store owners A, B, D, E, F, G, H), run `bash /opt/somba/deploy/seed-demo.sh --with-2fa`. Those accounts then need the six-digit code from an authenticator app: choose "enter a setup key" and paste the `totp_key` of that account (time based, 6 digits), or run the `code` command above. The `recovery_codes` in the file work once each instead of a code.

If you switch on the platform rule "staff two-factor required" while the demo has two-factor off, the demo admins are asked to enrol at their next sign-in. Seed with `--with-2fa` first if you want them ready.

## What it creates

- **35 accounts**: 10 customers, 6 admins (one per department plus the super admin), warehouse manager, supervisor and operator, a rider, a supervisor and a rider for a second demo warehouse, 8 store owners and 5 team members of store A.
- **8 stores** and **45 listings** in every state, in 8 categories, with **96 pictures** (about 7 MB, Unsplash and drawn logos, credits in `deploy/demo/images/CREDITS.md`).
- **38 orders** (42 with express too) in every state, with their legs, riders and warehouse scans, wallet payments, refunds, returns, an exchange, a replacement, a dispute, 16 reviews (8 with photos), questions, chats (with photos), support tickets, a payout, campaigns, a flash sale, promo codes, banners, fraud alerts, warehouse incidents and stock. Twelve of them are the "orders to process" of the next section: work waiting for each active store, a split delivery and a failed attempt.
- A second warehouse, **Entrepôt Maluku (démo)**, that serves only the commune of Maluku, so one order can travel between two warehouses. It is the only change near real routing: a real customer pinned in Maluku would be routed to it while the demo is installed.

## Both languages (English and French)

Every demo record that people read exists in **both languages**, so the apps and the web show French in French mode and English in English mode, with or without a Google Translate key on the server:

- **Products** (title, description, option labels such as Taille / Couleur), **stores** (description, returns and shipping policy), **banners**, **campaigns** and **flash sales** are written in English and get their French as an **author** row (the same kind a seller types by hand, never a machine row, so nothing is billed and the "Translated automatically" badge does not appear on them).
- **Reviews, store replies, questions, answers and chat messages**: each text is in the language its demo author uses (Jean-Baptiste writes French, the others English) and the **other language is stored next to it** (`translations` rows `review` / `review_reply` / `question` / `answer` / `chat_message`, field `text` or `reply`), so a reader can switch language without a translate call.
- **Notices** that quote a person's words (a new review, a question, a return reason...) or name a product get a French body that has the quote and the product name in French.

How it works: `seed-demo.ts` runs the real services (they write one language), then `demo/demo-bilingual.ts` adds the other language from `demo/demo-texts.ts` (every demo sentence with its twin) and from the catalogue. It only **adds**: a row is inserted when none exists for that record, field and language, so text a person edited, a French row a person wrote or one Google produced is never replaced, and a second run adds nothing ("both languages: 0 author row(s) added").

Adding a demo text (a new review, message, note...) without its twin in `demo-texts.ts` fails `demo-bilingual.spec.ts`; the seed prints `! no twin in demo-texts.ts for ...` for a text it does not know.

Not stored in two languages, because the data model has no second-language field for them: promo and coupon descriptions, and the free text inside returns, disputes, exchanges, replacements and warehouse notes. The notices about them show the French of the sentence around the quote, and the quote itself in French (the demo texts are in the table).

### One-off: bring French to a server that was seeded before this change

The products and other records "were already there", so the older seed skipped them and French never arrived. After deploying the version with `demo-bilingual.ts` (the normal deploy, see "Commands"), on the server as root:

```bash
bash /opt/somba/deploy/seed-demo.sh        # idempotent top-up: adds the missing French/English author rows (about 30 seconds); reloads the API
```

The summary line says how many rows were added (`✓ both languages: N author row(s) added`). It touches only demo records, never overwrites a row that is already there, and costs nothing (no translation call).

Then, for **any other record** (a seller's own products, categories, stores, banners, campaigns that has no French or English yet):

```bash
sudo -u somba bash -c "cd /opt/somba/api && npm run translate:backfill:prod -- --dry-run"   # how many records and characters, and the cost: writes nothing
sudo -u somba bash -c "cd /opt/somba/api && npm run translate:backfill:prod"                 # queues them and translates (needs the Google key, see set-secret.sh)
```

The dry run prints the provider, the records per type, the characters and the estimate. Google Cloud Translation costs about **US$ 20 per million characters**, so the demo-sized catalogue (a few thousand characters) is a few cents, and a 1,000-product shop with 500-character descriptions is about US$ 10. A daily character limit (`TRANSLATE_DAILY_CHAR_LIMIT`, default 300,000) applies; what does not fit stays queued and the API's own 60-second sweeper finishes it the next day. The backfill only fills the missing language of products, categories, stores, campaigns, flash sales, banners and broadcasts; it never touches an author row. Reviews, questions and chat messages are translated when written or on demand instead.

## Orders to process, per store

These orders are made through the real order service (basket, wallet payment, pickup legs, notices), so the seller portal, the customer app, the rider app and the warehouse desk all show them. Each customer's basket is different from their other baskets, and every order belongs to a demo customer, so the removal takes them out. Sign in as the **store owner** (`seller.a`, `seller.b`, `seller.c`, all `@demo.komoriko.test`) and open **Orders**; the customer is in the second column.

| Store | Order (customer) | What to try |
|---|---|---|
| **A** Maison Kinshasa (`seller.a`) | Honey, 2 jars (`reviewer.1`, Limete) | Paid and waiting. Open it and press **Package Ready**. The pickup leg then waits for a rider (warehouse desk, or `rider`). |
| | Solar lantern + football (`reviewer.2`, Kalamu) | Two lines, waiting. Press **Cancel items**, tick one line, give a reason: only that line is cancelled, restocked and refunded to the customer's wallet; the other line carries on. |
| | Wooden building blocks (`reviewer.3`, Bandalungwa) | Already marked ready. Its pickup leg waits for a rider: as the warehouse supervisor assign `rider`, or sign in as `rider` and follow the task. |
| **B** Limete Grossiste (`seller.b`) | Hibiscus tea, 3 (`reviewer.4`, Kintambo) | Waiting: **Package Ready**. |
| | Storage bins + notebooks (`reviewer.1`, Limete) | Two lines: **Cancel items**. |
| | Steel water bottle, 2 (`customer.fr`, Ngaliema) | Already marked ready, waiting for a rider. |
| **C** Ndolo Électro (`seller.c`) | Electric kettle (`reviewer.2`, Kalamu) | Waiting: **Package Ready**. |
| | Stand fan + USB charger (`reviewer.3`, Bandalungwa) | Two lines: **Cancel items**. |
| | Steam iron (`reviewer.4`, Kintambo) | Already marked ready, waiting for a rider. |

No demo store needs a code unless the seed ran with `--with-2fa` (then stores A and B do; store C never has two-factor).

### Split delivery (stores A and B in one order)

The warehouse delivers what has arrived once a parcel has waited longer than **Split delivery after (hours)** (default 24, setting `splitDeliveryAfterHours`; 0 means never). Two orders show it:

| Order | Where to look | What you see |
|---|---|---|
| Planner + bath towel (`customer.full`, Gombe) | `customer.full`: **Orders**, open it, the 4-digit code. `seller.a`: the order. `seller.b`: the order. `rider`: **Tasks**. | A's parcel (the planner) reached the warehouse more than 24 hours ago, so a **partial delivery** left with `rider` alone, with its own code. B's parcel (the towel) is still on its way to the warehouse and will get its own leg later. |
| Football + cassava flour (`customer.fr`, Ngaliema) | `customer.fr`: **Orders**, the order is delivered. `seller.a` and `seller.b`: both packages show delivered. `admin.operations`: the order shows two delivery legs. | Both parts were delivered, on two legs about a day apart, each with its own code. |

Try it live: as `warehouse.operator` scan in B's parcel of the first order and the leg of the second part is planned by itself; as `rider` finish the partial leg with the code from `customer.full` and see the order stay open until B's part is delivered. The warehouse job (every 5 minutes) is what starts a partial leg for an order that waited too long; to see it start one, change **Split delivery after (hours)** in Admin > Settings.

### Failed delivery attempt

Ceramic dinner plate set (`reviewer.4`, Kintambo, store A): the rider went out, the customer did not answer, and the attempt was marked failed ("Customer not reachable"). The delivery leg was re-opened as **attempt 2**. As `reviewer.4` (the order shows the failed attempt and the new one, plus a notice "Delivery attempt failed"). As `rider` the retry is in the task list: pick it up, and deliver it with the code from the customer's order screen.

### Express delivery (store C)

Express delivery sends a rider **straight from the seller to the customer** (no warehouse) when seller and customer are in the same commune. Store C (Ndolo Électro) has express switched on and its pickup pin is in Kasa-Vubu; `reviewer.1` has a second pinned address there (Avenue Kasa-Vubu). Express is off in production (setting `expressDeliveryEnabled`) until the current **rider app build, which knows the express job**, is installed on the riders' phones, so the express orders are made only with the explicit opt-in:

```bash
bash /opt/somba/deploy/seed-demo.sh --with-express      # or: DEMO_WITH_EXPRESS=1 bash ...   
```

It sets **only** `expressDeliveryEnabled=true`, says so loudly, and from then on a real order from any store that offers express, to a customer in the same commune, gets an express rider: **install the current rider app first**. Without the flag the seed skips the orders and prints the flag; if express was already on they are made without it. The removal leaves the setting as it is and prints how to turn it off (**Admin > Settings > Checkout and delivery > Express delivery**). Store C's toggle needs no clean-up: the store is a demo store and goes with the demo.

| Order (`reviewer.1`, Kasa-Vubu) | What to try |
|---|---|
| Charger x2 | Paid, waiting. `seller.c`: **Package Ready**. The express leg is released to the warehouse desk (Express tab), which shows "Waiting for the seller to pack" on it until then (a rider can already be assigned by hand). **Auto-assignment is off by default**, so the desk assigns the rider (`rider`) itself: Warehouse > Express > **Assign rider**. |
| Stand fan | Out for delivery: the rider collected it and is on the road, with a 4-digit code on the customer's order screen. `rider`: finish it with the code. |
| Steam iron | Delivered about a day ago (code checked). |
| Kettle + charger | Paid, waiting to be packed (`seller.c`: **Package Ready**), like the charger order above. |

**Auto-assignment on "Entrepôt Kinshasa".** The warehouse the express order and the other demo orders use is the launch warehouse that `bootstrap:prod` creates, not a demo record: the demo removal does not delete it, and the seed does not change its settings (auto-assignment stays **off**, the platform default). To let the express order go to a rider the moment the seller presses Package Ready, turn it on yourself, and turn it off again after the demo if you wish: sign in as the warehouse manager (`warehouse.manager`) or an admin, open **Warehouse > Settings > How the warehouse runs** (an admin picks the warehouse in the scope bar first), tick **Auto-assignment** and save. It then hands new pickup and express legs to the least busy available rider while the warehouse is open.

### Parcel labels and scanning

Every demo package that is ready or further has KOMORIKO labels (`PKG-` and 8 characters), and the scans agree with each leg's state: legs already collected have their pickup scans, finished legs have both. About every third package is in **2 boxes**. The setting **Admin > Settings > Delivery model > Require parcel scanning** is on, so a rider cannot collect or hand over a parcel until every box was scanned.

Try it with a phone (the camera needs `https`, which the demo server has):

1. **Print a label.** `seller.a`: open an order marked ready (or press **Package Ready** on a waiting one, with the **Boxes** stepper at 2) > **Print labels**. Choose *Label 100 x 150 mm* or *A4 sheet*, print or **Save as PDF**, and open the PDF on a computer screen. Before the rider scanned anything the stepper can change the box count (new labels, the old ones are void); afterwards it is locked.
2. **Scan out.** `rider` (rider app, or the rider web portal on the phone): open a leg that is *assigned*, tap **Scan parcels**, point the camera at the label on the screen: "1 of 2 scanned", then the second label. **Picked up** stays disabled until both are scanned; try typing the code (**Type the code**) and scanning a wrong code ("... is not part of this pickup.").
3. **Scan in at the warehouse.** `warehouse.operator`: Warehouse > Desk > **Receive**, scan the boxes with the camera or type their codes: "PKG-... received · 1 of 2 boxes in", the leg is scanned in with the last box. `warehouse.manager` (or supervisor) can **Mark scanned by hand** a box whose label is damaged, with a reason (it is in the audit log).
4. **Deliver.** `rider`: on the delivery leg scan the boxes at the customer; only then does **Delivered** and the customer's code step open.
5. **Switch it off.** `admin.super`: turn **Require parcel scanning** off: scanning still records but nothing is blocked. Turn it on again.
6. **A return.** `customer.full` (customer app or web): a return that is approved shows the box's **QR code** and its code with "write this code on the package"; the rider scans it when collecting.

### Preparation time

Demo listings carry a preparation time from 0 to 5 days (food and oils 0, clothes and electronics 1 to 2, hand-made pieces 3 to 5; the Djembe drum of store G is 5), and the stores keep a handling time (A 1 day, B 2, C 1, G 3). The delivery estimate shown on a product and at checkout is the preparation time plus the platform's transit for the route.

### What is not seeded (and how to get it)

- **Mobile-money and card orders** need pawaPay or Stripe keys (`MM_PROVIDER` is `none` in production): put the keys in with `set-secret.sh`, see `LIVE-RUNBOOK.md` sections 6 and 7. Then place an order in the customer app with that method, or ask for the sandbox provider (`https://api.sandbox.pawapay.io`).
- **Awaiting-payment orders** only exist while a mobile-money or card payment is being confirmed, so they appear once those keys are in and a customer starts a payment. The demo cannot fake that state honestly.

## The scenarios

Sign in at the web portal (`/login`) for stores, admins, warehouse and riders, and in the customer app for customers. Email addresses below all end in `@demo.komoriko.test`.

### Customers

| Account | What it is for | Try this |
|---|---|---|
| `customer.full` (Grace Mbuyi) | The full customer: verified, a large wallet, two pinned addresses (Gombe and Maluku) | Open **Orders**: 16 orders (the split-delivery orders are described in "Orders to process"). Paid; seller preparing; ready for pickup; at the warehouse; out for delivery (open it to see the 4-digit code); delivered 2 days ago (can be returned and reviewed); delivered 35 days ago (return window closed, shows why); cancelled and refunded; a return waiting for the seller (with its timer); a return approved and refunded; an exchange; a replacement; a dispute; a basket from two sellers (one package at the warehouse, one not collected); an order using promo code `DEMO10`; one using the store coupon `MAISON5`; one going to Maluku through two warehouses. Also **Wishlist**, **Cart** (with a saved item that is out of stock), **Followed stores**, **Notifications** (read and unread), **Wallet history**, **Chats** (one with photos), **Support tickets** (one closed, one open with a photo), **Help**. |
| `customer.new` (Patrick Kasongo) | New, verified, nothing yet | Empty orders, wallet, addresses, wishlist. Add the first address (type one, or use the map), then place the first order: it will ask you to top up the wallet first. |
| `customer.unverified` (Chantal Ilunga) | Phone and e-mail not verified | Her cart has two items. Start checkout: it is blocked and asks you to verify. (Sending the code needs SMS or e-mail keys, see below.) |
| `customer.fr` (Jean-Baptiste Mukendi) | Language French | The whole app in French. Product names are shown in French. Open the chat with Maison Kinshasa: he writes French, the store answers in English, and each message has its other language stored (no wait for a translation). A question he asked in French is answered in English and shows in both. A return the store rejected is escalated to KOMORIKO. |
| `customer.suspended` (Albert Tshibangu) | Suspended | Sign-in is refused. In the admin portal (Customers) reactivate and sign in again. |
| `customer.fraud` (Rita Banza) | Has fraud alerts | Nothing special in the app. In the admin portal, **Fraud** shows two open alerts for her. |
| `reviewer.1` to `reviewer.4` | Past buyers | They wrote the reviews, photos and helpful votes on the product pages. One of them wrote an abusive 1-star review that store B reported. |

### Store owners (seller portal)

| Account | What it is for | Try this |
|---|---|---|
| `seller.a` (Maison Kinshasa) | Approved, **Pro** plan, two-factor on. The full store | **Products**: live, waiting for moderation (2), rejected, blocked, draft, out of stock, low stock, options (size, colour), an 8-photo gallery, a price drop and a flash price. **Orders**: every state, mark one ready. **Returns**: answer the one with the running timer (accept or reject). **Exchanges / Replacements**: approve. **Questions**: answer the open one. **Reviews**: reply, report. **Messages**: the chats. **Promotions**, **Coupons**, **Flash sales**: one running, one waiting for marketing. **Finance**: earnings, statements, transactions, tax, two payouts (one paid with a made-up receipt, one requested; no real money moves). **Analytics**: 30 days of views and sales. **Team**: five members and one open invitation. **Storefront**: profile, logo, banner, French text, policies, goals. |
| `seller.b` (Limete Grossiste) | Approved, **Free** plan, another commune | Second seller in the two-seller basket. Try **Coupons** or **Flash sales** or invite a second team member: the plan refuses and offers an upgrade. Subscribe to Pro with the wallet. |
| `seller.c` (Ndolo Électro) | Approved, **no two-factor** | With Admin > Settings "Require two-factor for sellers" switched **on**, sign-in forces enrolment before anything else. Switch the setting back when you are done. |
| `seller.d` (Bandal Textiles) | KYC submitted | As an admin (moderation, operations or super) open **Sellers**, read the documents, approve or reject. |
| `seller.e` (Kintambo Cosmétiques) | Rejected with a reason | Sign in: the reason shows. Correct the KYC and **resubmit**. |
| `seller.f` (Gombe Gadgets) | Suspended | Read-only: orders and earnings can be read, nothing can be changed, and the listings are off the shop. |
| `seller.g` (Kasa-Vubu Artisanat) | Vacation mode on | In the shop its listings show a "back on" date and cannot be ordered. |
| `seller.h` (Ngaliema Fournitures) | Approved, **no pickup pin** | Try to add a product: refused until you pin the pickup location on the map. |
| `team.manager`, `team.catalog`, `team.orders`, `team.finance`, `team.support` | The five team roles of store A | Each sees only what its role allows: the menu changes, and a typed URL shows "Page not available". |

### Admins and warehouse

| Account | Try this |
|---|---|
| `admin.super` | Everything. Settings, roles, audit log. **Remove this account before launch.** |
| `admin.moderation` | Moderation queue (2 products), reported review, seller approvals, fraud. |
| `admin.operations` | Settings, geography, warehouses (the demo one), orders, seller approval. |
| `admin.finance` | Payments, refunds, payouts (one waiting), finance figures. |
| `admin.marketing` | Banners (3), promo codes (one paused), flash sales, the campaign waiting for approval. |
| `admin.support` | Tickets (3), disputes and returns (one escalated), customers. |
| `warehouse.manager`, `.supervisor`, `.operator` | Desk with open parcels, custody, transfer runs, returns, incidents (3), bins and stock ledger, settings, analytics (manager). |
| `rider` | Assigned pickups and deliveries. The delivery code is on the customer's order screen. |
| `warehouse.maluku`, `rider.maluku` | The demo warehouse and its rider: the Maluku order arrives here. |

### Creating accounts live (to try sign-up yourself)

Use any e-mail ending in `@demo.komoriko.test` so the removal also takes it out.

**New customer** (app or web): name `Test Customer`, e-mail `my.customer@demo.komoriko.test`, phone `+243 900 000 901`, a password you choose (8+ characters). Afterwards the account is unverified: checkout is refused until a code is entered (needs SMS or e-mail).

**New store**: sign up as a seller with `my.store@demo.komoriko.test`, phone `+243 900 000 902`, then fill the KYC form:

| Field | Value |
|---|---|
| Store name | Test Store |
| Legal name | Test Store SARL (demo) |
| Phone | +243 900 000 902 |
| ID number | DEMO-ID-0901 |
| RCCM | CD/KIN/RCCM/DEMO-0901 |
| Tax number | A0000901D |
| Documents | `deploy/demo/kyc/sample-id-card.jpg` and `sample-rccm.jpg` (also `sample-tax-certificate.jpg`). They say SPECIMEN and carry made-up data. |

Then sign in as `admin.super` (or moderation, operations), open **Sellers**, approve it. The owner then needs two-factor, pins the pickup location on the map, and can add a product (it goes to the moderation queue). This path is tested end to end by `api/test/demo-signup-check.cjs`.

## Phone numbers and SMS

The demo phone numbers (`+243 900 000 xxx`) are made up, but a number is a number: when Twilio is live, a code sent to one could reach a stranger. Seeding itself sends no SMS or e-mail. **To test SMS or phone-code sign-in, first put your own number on the account** (profile > phone), and in the live sign-up samples below use your own number instead of the sample ones.

## What cannot work without keys

| Missing | Effect in the demo |
|---|---|
| Stripe | No card payments. Demo orders use the wallet. |
| pawaPay (mobile money) | No top-up, no mobile-money checkout, no refund to a phone. The demo wallets were filled by the seed. |
| SMTP (e-mail) | No verification e-mail, password reset or team invitation e-mail. |
| Twilio (SMS) | No phone code. `customer.unverified` can be seen blocked, but cannot be verified. |

Google Maps, Google Translate and Firebase push work if their keys are installed on the server. The demo's own texts do not need the Google key: both languages are stored (see "Both languages"). The key only matters for text that people type later.

## Time

The demo is dated relative to the day you add it. Two things age:

- The order "delivered 2 days ago" can be returned for 7 days after delivery. After about 5 days the Return button closes.
- The return waiting for the seller has a 48-hour answer time that started 20 hours before you added the demo. After about 28 hours it times out and the customer can escalate (a valid scenario too).

To start the clock again, remove the demo and add it again (a minute).

## What the demo does not cover

- **Help contacts** (support phone, e-mail, WhatsApp) are platform settings. The demo does not change settings: set them in Admin > Settings to see them in the Help screen.
- **Recently viewed** products live in the phone only: browse a few products and it fills.
- A rejected product shows no written reason. The platform does not store one for products (stores and campaigns do).
- No broadcast was sent, because a broadcast reaches every real customer.

## Removal in detail

`seed-demo.sh remove` prints, for every table, how many rows belong to the demo, and the files it would delete. `remove --yes` deletes exactly those rows in one transaction, then the picture files and the private documents, then reloads the API.

It finds the demo **only** through the demo accounts. It leaves your settings, categories, geography, your admin and the real warehouse untouched.

It refuses, and deletes nothing, while real data still points at the demo: a real order containing a demo product, or a real delivery that uses the demo warehouse or a demo rider. It tells you which orders; finish or cancel them, then run it again.

Real products that carry a demo review get their rating recomputed. A demo customer who ordered a real product keeps no stock adjustment (the units are not given back).
