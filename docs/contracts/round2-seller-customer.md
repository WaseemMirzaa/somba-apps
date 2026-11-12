# Round 2: seller portal and customer app (contract notes)

Migration `1793260000001-SellerCustomerRound2` (QueryRunner API, MySQL and SQLite): `reviews.photos`, table
`store_follows`, and `sellerLapsedAt` on `disputes`, `replacements` and `exchanges`.

## Photos in reviews
`reviews:create { productId, rating, text, photos?: string[] }`. At most **4** photos, each one a URL this platform stored
through `POST /api/v1/uploads` (the same path as support tickets); anything else is refused ("You can attach up to 4
photos.", "Photos must be images uploaded through the app."). Every review the API returns (`reviews:list`,
`reviews:seller`, `reviews:admin`, `review:created`, `review:updated`) carries `photos: string[]` (empty when none).
Photos follow the review's moderation: a hidden review drops out of shopper and seller lists, and the shopper push is
`{ id, productId, status: "hidden" }` with no content; moderators keep the review with its photos and can restore it.
A seller reports the review as before (`reviews:report`).

## Following a store
All events answer `{ ok, data | error }`.

| Event | Who | Answer |
|---|---|---|
| `follows:toggle { sellerId, following? }` | signed-in account | `{ sellerId, following, followers }`. `following` sets it, omitted flips it. Refused: own store, unknown or unapproved store, more than 200 follows |
| `follows:state { sellerId }` | anyone | `{ sellerId, following, followers }` (a guest is never "following") |
| `follows:list { limit?, offset? }` | signed-in account | `[{ id, name, logoUrl, bannerUrl, rating, badge, productCount, followedAt }]`, newest follow first, public fields only |

`sellerId` is the store id; an older listing's owner account id resolves to the same store. Push: `follows:updated`
(`{ sellerId, following, followers }`) to the caller's other devices.

When a listing becomes visible to shoppers (created live, or approved/restored from another status) every follower
gets one notice, once per product: `type: "store"`, `entityId` = the product id, title "New from a store you follow",
body "<store>: <product>", with its French text (`titleFr`/`bodyFr`). It is saved in the bell and pushed; the
Promotions switch in notification settings controls the push. Its link is `/shop/products/<id>`.

## Timers
- **Return window**: counts from the last `delivery` leg that reached the customer. A seller pickup, a return leg or a
  replacement delivered later no longer moves the end of the window.
- **Support response time** (`sellerResponseHours`, key unchanged; see `admin-controls.md`): a return, dispute, replacement or exchange
  that support has not decided by then alerts support **once** (`sellerLapsedAt` records it). Nothing moves and neither the
  customer nor the seller is told; support decides as usual.
- The sweeps run every `AFTER_SALE_SWEEP_MS` (default 60 000, read at start-up) and `VACATION_SWEEP_MS`.

## Help contact settings
Public settings `supportPhone`, `supportEmail`, `supportWhatsapp` (admin-written, blank = not offered, validated: a phone
number such as `+243 970 000 000`, an e-mail address). They arrive with `settings:get` and `settings:updated`; the app's
Help screen lists a row for each one that is set (`tel:`, `mailto:`, `https://wa.me/<digits>`).
