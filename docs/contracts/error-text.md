# Error text contract: the server explains every error in the user's language

Owner: i18n server-errors builder. The web app (`web/src/lib/api-errors.ts`), the customer app
(`mobile/lib/l10n/server_errors*.dart`) and the rider app (`rider-app/lib/l10n/server_errors.dart`) code against this file.
Today each client keeps its own English-to-French list and 237 of the 733 server messages were in none of them. The French
now lives on the server, once, and travels with the error.

## 1. What changes on the wire

Nothing that exists today changes. Every `error` and `message` stays the stable English sentence, and every `code` and
extra field is untouched. Two optional fields are added next to them.

| Transport | Existing field (unchanged) | New field | Type |
|---|---|---|---|
| Socket.IO ack of a failed event | `error: string` | `errorFr?: string` | French sentence |
| HTTP error body (`4xx`/`5xx` raised as an `HttpException`) | `message: string \| string[]` | `messageFr?: string \| string[]` | French sentence, or a list the same length as `message` |
| A refusal inside a successful ack (see 3) | `reason: string` / `error: string` | `reasonFr?: string` / `errorFr?: string` | French sentence |

```
socket   { ok: false, error: "Only 3 of \"Tote bag\" left in stock.", errorFr: "Il ne reste que 3 × « Tote bag » en stock." }
socket   { ok: false, error: "Sign in to continue.", code: "x", errorFr: "Connectez-vous pour continuer." }   // other fields stay
http 400 { statusCode: 400, message: "Sign in to continue.", error: "Bad Request", messageFr: "Connectez-vous pour continuer." }
http 400 { statusCode: 400, message: ["email must be an email", "Password must be at least 8 characters."],
           error: "Bad Request", messageFr: ["Saisissez un e-mail valide.", "Le mot de passe doit contenir au moins 8 caractères."] }
```

## 2. When the field is present

- **Only when the dictionary knows the sentence.** An unknown message (a typo-level surprise, a provider text, free text a
  person typed) comes back with the English field only. Absence is normal; never treat it as an error.
- **Always French.** The field does not depend on who is asking: the server does not know the viewer's language and does not
  need to. Sending it costs a few dozen bytes. The client decides whether to show it.
- **Never overwrites.** A handler that already set `errorFr` / `messageFr` keeps its own.
- **Lists are all or nothing.** `messageFr` is a list only when every item of `message` is known, so a client never shows half
  a form in one language. Otherwise it is absent and the client shows `message`.
- **Dynamic parts pass through.** Names, references, order numbers and statuses inside a sentence are kept or mapped;
  amounts are written the French way (`52,00 $`, non-breaking spaces).
- Socket acks get `errorFr` in one place, `SocketIoAdapter.bindMessageHandlers` (`api/src/realtime/socket-io.adapter.ts`), so
  every handler of every gateway has it, including the throttle's `Too many requests — slow down.` and the two socket
  guards that answer before a handler runs (`password_change_required`, `twofa_required`). HTTP bodies get `messageFr`
  from the global `ErrorFrFilter` (`api/src/common/error-fr.filter.ts`, registered through `APP_FILTER`), which keeps the body
  Nest builds (`statusCode`, `message`, `error`, plus the extra fields of a custom exception such as `code`) and only adds the field.
- Out of scope, so no `errorFr`: `500` bodies (internal errors, never shown as text), webhook answers to payment providers,
  socket `connect_error` handshake refusals, and acks that are not failures.

## 3. Refusals inside a successful ack

Some events succeed and carry a refusal as data: a promo code that does not apply (`{ ok: true, data: { ok: false,
discount: 0, reason } }`), the lines of a stock check (`reason`), the payouts of a batch (`error`). A plain object or list
inside `data` (3 levels deep, 100 items at most) that has a string `reason` or `error` gets `reasonFr` / `errorFr` next to it
when the dictionary knows the sentence. Nothing else in the data is touched.

## 4. The client rule

```
language is French  and  errorFr / messageFr is present   ->  show it.
otherwise                                                  ->  keep the client's own mapping of the English text, or the English text.
```

- Read `errorFr` (or `messageFr`) first; do not run the English sentence through a local list before it. The local list can
  stay as the fallback for the sentences the server does not know, and for messages the client makes itself (offline,
  "Socket not connected.", timeouts).
- English readers keep reading `error` / `message` exactly as today.
- Act on `code` and the other structured fields, never on the wording, as before.
- `messageFr` can be a string or a list: show a list joined with a space or one per line, like `message`.
- A client may delete the sentences its list shares with the server once it reads the new fields; the server dictionary is a
  superset of the three client lists (they were its starting point, with the same wording).

## 5. The dictionary (server)

- `api/src/common/error-fr.ts`: `errorFr(message): string | null`, `errorFrList(messages)`, `withErrorFr(ack)`, `ackWithFr(ack)`.
  Folds spacing and curly apostrophes before the lookup, so `store's` and `store’s` are the same key.
- `api/src/common/error-fr-exact.ts`: whole sentences, English to French, grouped by the part of `api/src` that sends them.
- `api/src/common/error-fr-rules.ts`: sentences with a number, a name, a status or a field label in them (regular expressions),
  and the generic validator sentences (`{label} must be 2-100 characters.` ...). `error-fr-fields.ts` holds the labels
  (`Name` -> `Le nom`) and status words.
- **Guard:** `api/src/common/error-fr.spec.ts` scans `api/src` for what exceptions are thrown with, `fail('...')`, `error:` and
  `reason:` literals (constants, `super('...')` of error classes and template strings included) and for every field label passed
  to a validator, and **fails when a message a user can see has no French**. Messages that never reach a client are listed in
  the spec (`INTERNAL_FILES`, `INTERNAL_MESSAGES`) with a reason each. A new or reworded server message therefore cannot ship
  untranslated: add its French to `error-fr-exact.ts` (or a rule to `error-fr-rules.ts`) in the same change.
- `api/src/common/error-fr.wiring.spec.ts` proves the delivery end to end (a real Socket.IO round trip and HTTP requests).

## 6. Wording

French wording follows the existing client lists and `api/src/notifications/localize.ts` (versement, colis, livreur, entrepôt,
boutique, ticket, `Réservé aux ...`). Apostrophes are typographic (`’`). Quotation marks are `« ... »`. Amounts: `52,00 $`.
