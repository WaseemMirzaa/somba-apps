# Multilingual (EN / FR) — loopholes, design and build plan

Status: **built and tested** (2026-10-24). Planned by Opus 5.5, built by Sonnet 5.5 agents. Results: §5.
Scope: database, API (every module), seller / admin / warehouse / shop web, customer app, rider app.

---

## 1. Loopholes found (current code, main dev DB)

### Data model
| # | Loophole | Evidence |
|---|---|---|
| L1 | Product **description has no French**, and **variant names/options** (Size, Colour, "Black") have none either. | `products.description` only; `variants` one JSON |
| L2 | **71% of products have no French name or category** (84 of 119). The apps silently show English. | main DB count |
| L3 | **No source language.** The wizard forces an *English* title. French-first sellers either type French into the "EN" box (English shoppers then see French and nothing can translate it) or skip French. | `product-wizard.tsx` "Product title (EN) *" |
| L4 | French is stored as **extra columns per language** (`nameFr`, `categoryFr`, campaign `nameFr`, category `nameFr`). Adding Lingala or Swahili means a schema change on every table. Not normalized. | entities |
| L5 | Product **category is a copied name string**, and `categoryFr` is a second copy. If an admin renames a category, its products leave the category (filters compare names). Deleting a category leaves products pointing at nothing. 84 products have `categoryFr = NULL` even though the category table has French for all 6. | `products.category varchar`, `CategoriesService.update` |
| L6 | Admin categories form **saves the English name as the French one** when FR is blank (`nameFr \|\| name`). It looks translated but isn't. | `admin/categories/page.tsx:58` |
| L7 | **Live copies that go stale:** `products.sellerName`, `campaigns.sellerName`, `flash_sales.productName`. None is refreshed when the store or product is renamed. `sellers.productCount` is set by the seed and **never maintained**. | entities, grep |
| L8 | **Order lines snapshot only one name** (`order_items.productName`, `variant`). French shoppers see English on orders, returns, receipts and riders' delivery lists. | `order-item.entity.ts` |
| L9 | Store descriptions, flash-sale titles, CMS blocks, promo descriptions and marketing broadcasts are **one language only**. | entities |

### Behaviour
| # | Loophole | Evidence |
|---|---|---|
| L10 | Reviews, seller replies and Q&A **can't be read in the other language**. | `reviews.service.ts` |
| L11 | Notifications are stored in English and translated **on the phone by regex**. Pushes shown by the OS while the app is closed are therefore **English for French users**. The web bell is always English. Staff role pushes ignore language. | `notification_text.dart`, `push.service.ts` |
| L12 | Marketing broadcasts send **one title/body to everyone**. | `broadcasts.service.ts` |
| L13 | **SMS codes are always English.** | `verification.service.ts:112,159` |
| L14 | **Web language isn't saved.** It resets to French on every reload, isn't synced to the account, and web sign-up sends no language. Accounts default to `en` while the web UI is French; all 112 accounts are `en`. | `locale-context.tsx`, `auth-context.tsx` |
| L15 | **Search:** the server folds accents and covers both names, but not the French description. The app's on-device filter and the web search page don't fold accents ("electronique" ≠ "Électronique") and ignore French categories. | `browse.dart:51`, `shop/search/page.tsx:43` |
| L16 | The app's category product list shows the **English category key** as its title and in "Search in X". | `catalog_extra.dart:116,121` |
| L17 | The web product list takes French category labels from products' `categoryFr` (mostly NULL) instead of the categories table. | `shop/products/page.tsx:26` |
| L18 | **Moderation is one language.** Admins approve without seeing the other language; nothing marks text as machine-translated. | admin products |
| L19 | **Cost/abuse risk** if translation ever runs on a client: the Maps/Firebase keys ship inside the APK and the web bundle, so anyone could run up the translation bill. On-demand translation must accept only stored record ids, never free text. | design |
| L20 | Migrations don't pin `utf8mb4`; they rely on the DB default (the deploy script sets it). Low risk, documented. | migrations |

---

## 2. Design

### 2.1 Storage: one `translations` table (normalized)
A translatable record keeps its **authored text in its own columns, in its own language** (`sourceLang`).
Every other language lives as **rows** in one table. Each fact is stored once, and adding a language
needs no schema change.

```
translations
  id            uuid PK
  entityType    varchar(24)   product | category | seller | campaign | flash_sale | cms_block | broadcast
                              | order_item | review | review_reply | question | answer
  entityId      varchar(36)
  field         varchar(32)   name | description | variants | title | body | text | reply | productName | variant …
  locale        varchar(5)    en | fr   (future: ln, sw)
  value         text
  origin        varchar(10)   author (typed by a person, never overwritten by a machine)
                              | machine (Google) | snapshot (copied at order time)
  sourceLang    varchar(5)    the language the value was translated from (detected for reviews/Q&A)
  sourceHash    char(40)      sha1(sourceLang + "\n" + source text) — tells a stale machine row from a current one,
                              and lets identical strings ("Black", "XL") reuse one Google call
  createdAt, updatedAt
  UNIQUE (entityType, entityId, field, locale)
  INDEX  (entityType, entityId)
  INDEX  (sourceHash, locale)

translation_jobs                       (work queue, so a Google outage never blocks a save)
  id uuid PK, entityType, entityId, status (pending | done | failed), attempts int,
  nextAttemptAt datetime, lastError varchar(300), updatedAt
  UNIQUE (entityType, entityId)
```

Translatable base tables gain `sourceLang varchar(5) NOT NULL DEFAULT 'en'`: products, categories, sellers
(store description), campaigns, flash_sales, cms_blocks, broadcasts.

**Columns removed** after their data moves (migration `1792940000000-Translations`):
| Removed | Data moves to |
|---|---|
| `products.nameFr` | `translations(product, name, fr, origin author)` when not empty and ≠ name |
| `products.categoryFr` | nothing: derived from the category |
| `products.category` (name string) | `products.categoryId` FK → categories.id (indexed). A name with no category gets a new category row. |
| `products.sellerName` | nothing: joined from sellers |
| `categories.nameFr` | `translations(category, name, fr, author)` |
| `campaigns.nameFr` | `translations(campaign, name, fr, author)` |
| `campaigns.sellerName` | nothing: joined from sellers |
| `flash_sales.productName` | nothing: joined from the product (both languages) |
| `sellers.productCount` | nothing: counted on read (live products) |

**Intentional snapshots that stay** (historical records must not change when the source does), documented in
`docs/ARCHITECTURE.md`:
- `orders.customerName`
- `order_items.productName` and `sellerName`
- `payments.orderReference`, `payouts.sellerName`, `payout_statement_lines.*`
- `orderReference` / `customerName` / `productName` on disputes, exchanges, replacements, delivery_tasks and warehouse_exceptions
- `support_tickets.userName`, `warehouse_batches.riderName`, `stock_transfers.productName`

`orderReference` never changes, so copying it is harmless. Order-line names are also snapshotted in the other
language, as `translations(order_item, productName|variant, fr|en, snapshot)`.

### 2.2 API payloads stay compatible
Clients keep receiving the **same fields as today**. The API composes them from base columns plus translation
rows, so old app builds keep working.

**Product** (every place a product leaves the API: lists, detail, `product:created/updated`, cart,
wishlist, seller and admin lists, campaign and flash payloads):

| Field | Value |
|---|---|
| `name` | English: source if `sourceLang = en`, else the `en` row, else the source |
| `nameFr` | French: same rule |
| `description`, `descriptionFr` | same rule (null when there is no description) |
| `category` | category's English name (compat) |
| `categoryFr` | category's French name |
| `categoryId` | **new** |
| `variants` | canonical option groups, **unchanged**. These remain the purchase keys: cart, stock and order lines use them. |
| `variantLabels` | **new**, `{ en: Group[], fr: Group[] }`, index-aligned with `variants`. Display only. |
| `sellerName` | joined |
| `sourceLang` | **new**, `'en' \| 'fr'` |
| `machineTranslated` | **new**, served field names that came from Google, e.g. `["nameFr","descriptionFr"]` |
| `translationStatus` | **new**, `'done' \| 'pending' \| 'failed' \| 'off'` |

**Category:** `{ id, name, nameFr, icon, image, sortOrder, sourceLang, productCount }`.
**Seller/store:** `description`, `descriptionFr`.
**Campaign:** `name`, `nameFr`.
**Flash sale:** `title`, `titleFr`, `productName`, `productNameFr`.
**CMS block:** `title`, `titleFr`, `body`, `bodyFr`.
**Broadcast:** `title`, `titleFr`, `body`, `bodyFr`.

**Order line:** `productName`, `productNameFr`, `variant` (canonical), `variantFr`.
Old orders have no snapshot; fill from the current product translation, else the name.

**Notification** (socket payload and list): adds `titleFr`, `bodyFr`, computed on the server (§2.5). The stored
row is unchanged.

### 2.3 Writing translatable text
`products:create` / `products:update` (seller and admin) accept:
- `name`, `nameFr`, `description`, `descriptionFr`, `variants`, and optional `variantLabels`.
- At least one of `name` / `nameFr` is required ("Enter a product title in English or French.").

Source language rules:
- Only `name` given → `sourceLang = en`.
- Only `nameFr` given → `sourceLang = fr`, and the base column `name` holds the French text.
- Both given → `sourceLang` = the client's `sourceLang` if sent, else `en`. The other language is saved as an
  `author` row.
- Description follows the product's `sourceLang`. If the seller typed only the other language's description,
  it becomes the source text and the authored one moves accordingly.

Editing rules:
- A seller edit to a translated field writes an `author` row, which the machine never overwrites.
- Clearing a translated field deletes its row, and the machine fills it again.
- Changing source text marks `machine` rows stale (sourceHash) and queues a job.
- **Moderation:** French edits count as material changes (re-review). Machine writes never re-queue moderation.
- Categories, campaigns, flash sales, CMS blocks, broadcasts and store descriptions use the same rules and
  fields. Admin forms stop copying EN into FR (L6).

### 2.4 Translation engine (`api/src/translation/`)
- **`TranslatorProvider`** interface: `translate(texts: string[], from, to) → string[]` and
  `detect+translate` for reviews/Q&A.
  - `GoogleTranslator` uses Cloud Translation **v2** REST (`translation.googleapis.com/language/translate/v2`,
    `format: 'text'`), with up to 100 segments and 25k chars per call.
  - **Credentials:** `GOOGLE_TRANSLATE_API_KEY` (a server-only key restricted to Cloud Translation) if set.
    Otherwise an OAuth token from the existing **`FIREBASE_SERVICE_ACCOUNT_JSON`** (its token already carries the
    `cloud-platform` scope; header `x-goog-user-project`).
  - `FakeTranslator` (tests, smokes, CI): deterministic `"[fr] text"` / `"[en] text"`.
  - `Off`: nothing is translated, and composition falls back to the source text.
  - `TRANSLATE_PROVIDER=google|fake|off`. Default: `google` when a credential exists, else `off`. Jest always
    uses `fake`.
- **What is never sent to Google:** variant options with no letters, sizes (`XS…5XL`, `EU 42`), codes (`128GB`,
  `iPhone 15`), seller and store names, emails, phone numbers. These are copied as-is.
- **Dedupe:** before calling Google, reuse any `translations` row with the same `sourceHash` and target locale.
- **Queue:**
  - A save upserts a `translation_jobs` row, and the worker runs at once (`setImmediate`).
  - A 60 s sweeper retries due jobs with backoff 1 m, 5 m, 30 m, 2 h, 12 h. After 6 failures the job is `failed`.
  - When a job finishes, the composed entity is emitted again (`product:updated`, `categories:updated`, …) to the
    same rooms as today.
- **Budget:** `TRANSLATE_DAILY_CHAR_LIMIT` (default 300 000, about $6/day at $20 per million characters).
  Over the limit, jobs stay pending until the next day. Usage is logged.
- **Admin:** `translation:status` returns counts by state plus today's characters. `translation:retry {entityType?, entityId?}`
  re-queues one record or every failed job. The owning seller can call `products:retranslate {id}`.
- **Backfill:** `npm run translate:backfill [-- --dry-run]` queues every record missing a language, prints the
  character count and estimated cost, then lets the worker run.
- **On demand (reviews / Q&A):** `translate:text { kind: 'review'|'review_reply'|'question'|'answer', id, target }`.
  - It accepts **stored ids only** (L19), uses the per-socket throttle, and caches the result as a `translations`
    row.
  - Returns `{ text, sourceLang, same }`, where `same: true` means the text is already in the target language.

### 2.5 Notifications, SMS, locale
- The app's `notification_text.dart` patterns move to `api/src/notifications/localize.ts`.
  `localizeNotice(title, body, locale)` returns the French title/body, or null when no pattern matches.
- **Push** uses each recipient's `users.locale`. `toRole` splits tokens by recipient locale.
- `NoticeInput` gains optional `fr?: { title, body }` (used by broadcasts), which wins over the patterns.
- List and socket payloads add `titleFr` / `bodyFr`.
- A jest test scans `api/src` for notification `title:` literals and fails if any lacks a French mapping.
- **SMS:** the verification and sign-in SMS use French templates when `users.locale = fr`.
- **Web sign-up** sends `locale`; `auth.register` stores it.

### 2.6 Clients
**Web** (`web/`):
- **Locale:** stored in `localStorage` and synced with the account (the account's language on sign-in if this
  browser never chose; a toggle updates `me:update`). Default stays French.
- **Seller product wizard:**
  - Title EN and Title FR, either one required.
  - Description in EN/FR tabs.
  - Hint: "Leave one language empty and we translate it automatically."
  - Product page shows status per language (Written by you / Translated automatically / Translating… / Failed —
    Retry) and lets the seller edit a translation.
- **Admin:**
  - Moderation shows both languages with machine badges.
  - Categories: FR optional; the category page shows product counts, and delete is refused while products use
    the category.
  - Campaigns, flash sales, CMS and broadcasts get optional FR fields.
  - A translations panel (status counts, retry failed).
- **Shop:**
  - Product page shows the French description and variant labels; category filters use `categoryId`.
  - Order lines show `productNameFr` / `variantFr`.
  - Reviews and Q&A get "See translation" / "See original"; the store page shows `descriptionFr`.
  - The bell uses `titleFr` / `bodyFr`.
  - Search folds accents.
  - A small "Translated automatically" note appears under machine text.

**Customer app** (`mobile/`):
- **Models:** `descriptionFr`, `variantLabels`, `categoryId`, `sourceLang`, `machineTranslated`; order-line
  `productNameFr` / `variantFr`; notice `titleFr` / `bodyFr` (preferred over the device patterns).
- **Screens:**
  - Product detail shows the description and option labels in the user's language, plus a "Translated
    automatically" note.
  - Category list title and search hint use the localized category.
  - On-device search folds accents and checks French category and description.
  - Reviews and Q&A get "See translation".
  - The store page shows `descriptionFr`.
  - Orders, returns and receipts show the localized line name.

**Rider app:** order lines show `productNameFr` when the rider uses French; notices use `titleFr` / `bodyFr`.

### 2.7 Constraints, enforced twice (UI and data layer)
- **C-I1** Product title needed in at least one language.
- **C-I2** A category can't be deleted while products use it ("N products use this category. Move them to
  another category first.").
- **C-I3** Renaming a category keeps its products, which point at `categoryId`.
- **C-I4** `variantLabels` must match the shape of `variants`, else it is dropped and re-translated.
- **C-I5** Only stored ids can be translated on demand.
- **C-I6** A machine translation never overwrites an `author` row.

---

## 3. Build plan (Sonnet 5.5 agents; parallel, disjoint files)

| Agent | Owns | Delivers |
|---|---|---|
| **API-1: translations and normalization** | `api/src/translation/*` (new), entities, migration `1792940000000-Translations`, products, catalog, search, flows (campaigns, flash), content (cms, reviews, Q&A), sellers, orders (order-line snapshots), ops/broadcasts and analytics SQL, warehouse product reads, realtime gateway product/category/translate handlers, seed and bootstrap, backfill script, specs, new `test/i18n-smoke.cjs` | §2.1–2.4, §2.7 |
| **API-2: localized notices** | `api/src/notifications/*`, `auth/verification.service.ts`, `auth/dto` + `auth.service` register locale | §2.5 |
| **Web** | `web/` | §2.6 web |
| **Apps** | `mobile/`, `rider-app/` | §2.6 apps |

Then Opus 5.5 integrates and verifies:
1. Review every diff against this plan.
2. Run tests:
   - API: tsc, jest, migration drift check, and the full smoke set on a fresh seeded DB with
     `TRANSLATE_PROVIDER=fake`.
   - Web: tsc, lint, build.
   - Apps: flutter analyze and test for both apps.
3. Migrate the main dev DB from the backup, without losing the 35 existing French names.
4. Test with real Google translation once the API is enabled:
   - Customer app (iOS simulator) and seller portal in **both languages**.
   - Admin, warehouse, rider web and rider app checks.
5. **Record videos** to `recordings/i18n/` (git-ignored), with captions on the web clips:
   1. Seller writes a product in English → French appears.
   2. Seller writes in French → English appears.
   3. Seller edits a translation by hand.
   4. Admin moderates in both languages; categories.
   5. Customer app in French: browse, product, options, cart, checkout, order, notification, review translation.
   6. Customer app in English, same product.
   7. Web shop FR/EN.
   8. Rider app in French.

## 4. What the owner must do
- **Enable the Cloud Translation API** in project `somba-et-teka`
  (console.cloud.google.com/apis/library/translate.googleapis.com?project=somba-et-teka). Billing is already on,
  since Maps works.
- **Pick one credential:**
  - (a) In IAM, give the Firebase service account (`firebase-adminsdk-fbsvc@somba-et-teka.iam.gserviceaccount.com`)
    the role **Cloud Translation API User**. No new key is needed.
  - (b) Or create a **server-only** API key restricted to the Cloud Translation API and put it in `api/.env` as
    `GOOGLE_TRANSLATE_API_KEY`.

  Don't reuse the app or web keys (L19).

  **Done 2026-10-24:** option (a). The API is enabled, and the service account has the role. Verified in both directions.


---

## 5. Results (2026-10-24)

### Every loophole and what closed it
| # | Closed by |
|---|---|
| L1 | Product `description` and option labels are translated (`translations` rows; `variantLabels {en, fr}` served). |
| L2 | Backfill: Google filled 126 records on the dev DB (82 product names, 40 descriptions, 18 option sets, 8 store descriptions, 1 campaign); 0 failed. |
| L3 | `sourceLang`. The seller writes the title in English **or** French (either one is required); the other language is translated. |
| L4 | French columns removed; the languages are rows in `translations`. Adding a language needs no schema change. |
| L5 | `products.categoryId` is a real FK. Renaming keeps products. Delete is refused while products use the category (UI and DB). |
| L6 | The admin category form no longer copies EN into FR; a blank FR is translated. |
| L7 | Stale copies (`products.sellerName`, `campaigns.sellerName`, `flash_sales.productName`, `sellers.productCount`, `products.categoryFr`) removed and joined/counted on read. |
| L8 | Order lines snapshot the other language (`productNameFr`, `variantFr`). Exchanges and replacements serve French names. |
| L9 | Store descriptions, flash sales, CMS blocks, campaigns and broadcasts are bilingual. |
| L10 | "See translation" on reviews, seller replies, questions and answers (stored ids only). |
| L11 | Notifications are localized on the server (80 titles, all bodies). Pushes go out in each recipient's language, and role pushes are split by language. |
| L12 | Broadcasts are sent per language. |
| L13 | SMS codes follow the account language. |
| L14 | The web saves the language, syncs it with the account, and sends it at sign-up. |
| L15 | Accent-insensitive search in the API, web and app, over both languages and descriptions. |
| L16 | The app's category screens use localized names. |
| L17 | The web category filter uses `categoryId` and the categories list. |
| L18 | Moderation shows both languages with "Translated automatically" badges. A French edit sends a listing back to review; machine translations never do. |
| L19 | Translation runs only on the server. On-demand translation accepts stored ids only. A daily character budget applies. |
| L20 | New tables pin `utf8mb4`. |

### Tests
- **API:** `tsc` clean; **835/835** jest tests pass (59 suites); no migration drift.
- **API smokes** (fresh seeded DB, fake translator): i18n 133/133. account, authz, flows, coverage, race, zones, multi-seller, p0-fixes, statements, kyc and socket all pass. gap-features passes 81 of 83; the 2 failures are its phone-OTP checks, expected on a seeded DB.
- **Web:** `tsc` clean; 70/70 unit tests pass. A browser audit of every portal (≈340 pages × EN/FR, 8 roles) ends with 0 console errors, 0 page errors and 0 failed requests. All 7 bilingual flows pass.
- **Apps:** `flutter analyze` clean; customer app **356** tests pass, rider app **81**.
- **Checked on the iOS simulator:**
  - customer app in FR and EN: browse, accent-free search, product page with the machine note, options, cart, checkout, order, notifications;
  - rider app in FR.
- **Real Google:** EN→FR and FR→EN verified on products, categories, options and reviews.

### Bugs found and fixed during testing
- App order stuck "pending" after payment (stale create reply).
- Snackbars with an action never closing.
- Rider socket URL ignoring `API_URL`.
- French amount spacing.
- A permanent "Not allowed." banner on the web orders page.
- Silent sign-out when token refresh was rate-limited; refresh now has its own limit.
- About 25 untranslated or raw labels in the web portals.
- English-only analytics names and role scopes; lowercased payment method names and French money format in notifications.
- The shared login page had no EN/FR toggle and an English tagline.
- The web address form stamped every address "France". Countries are now shown by code in the reader's language, and a missing country is never invented.
- Broken category images; validation errors on untouched wizard fields.

### Operating it
- **Dev DB managed by `synchronize`:** run `DB_DATABASE=<db> npm run i18n:migrate-synced-db -- --dry-run`, then without `--dry-run`, before starting the new API. It moves the French columns into `translations`; synchronize then drops them.
- **Production:** migration `1792940000000-Translations` runs on boot. Then run `npm run translate:backfill:prod -- --dry-run`, and the same without `--dry-run`.
- **Monitoring:** Admin → Settings → Translations panel (pending / done / failed, characters today, retry failed).
- **Settings:** `TRANSLATE_PROVIDER`, `GOOGLE_TRANSLATE_API_KEY` (optional) and `TRANSLATE_DAILY_CHAR_LIMIT` (see `api/.env.example`).

### Videos
`recordings/i18n/` (git-ignored) holds 9 MP4s and a README:
- **Captioned web clips:**
  1. seller writes in English → French appears;
  2. seller writes in French → English appears;
  3. seller corrects a translation;
  4. admin moderation and categories;
  5. shop in French;
  6. shop in English, with review translation.
- **iOS simulator clips:**
  7. customer app in French;
  8. customer app in English, with review translation;
  9. rider app in French.
