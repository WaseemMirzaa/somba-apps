# Stored text in both languages: reviews, replies, questions, answers, chat, support, disputes, returns, exchanges, replacements

Owner: the API. Companion to `docs/MULTILINGUAL-PLAN.md` §2.4. Web and app builders code against this file.
Code: `api/src/translation/translation.service.ts` (`translateForSave`, `translateForSender`, `saveTranslated`, `i18nFor`),
`api/src/content/reviews.service.ts`, `api/src/chat/chat.service.ts`, `api/src/content/support.service.ts`,
`api/src/disputes/disputes.service.ts`, `api/src/flows/{exchanges,replacements}.service.ts`, `api/src/notifications/quote.ts`.

## Why

A review, seller reply, question, answer or chat message that someone writes is translated into the platform's other
language BEFORE it is stored, and both languages are saved together. Every payload that carries the text ships both
languages, so no client has to press "See translation". The on-demand `translate:text` stays as the fallback.

## Contract (names are fixed; additions only, nothing existing changed)

```
type TextI18n = { sourceLang: string | null; en?: string; fr?: string }
```

- `sourceLang`: the language the author wrote in (translator-detected), `null` when unknown.
- `en` / `fr`: the text in that language. For the source language it is the original text, for the other one the machine
  translation. A key is present only when the value exists and is not stale (the text was not edited since).
- The whole object is ABSENT when nothing is known. Clients then fall back to `translate:text`.

Added next to the text it translates, on every list/get response AND every realtime event that carries the record:

| Record | Fields | Where they travel |
|---|---|---|
| Review | `textI18n` (for `text`), `replyI18n` (for `sellerReply`) | `reviews:list`, `reviews:seller`, `reviews:admin`, `reviews:create`, `reviews:reply`, `reviews:helpful`, `reviews:setStatus` acks; events `review:created`, `review:updated`, `review:reported` (inside `review`) |
| Question | `questionI18n` (for `question`), `answerI18n` (for `answer`) | `questions:list`, `questions:seller`, `questions:ask`, `questions:answer` acks; events `question:created`, `question:updated` (public shape, staff shape and seller shape alike) |
| Chat message | `textI18n` | `chat:start` / `chat:send` / `chat:messages` acks; the realtime event `chat:message` `{ conversation, message }` |
| Chat conversation row | `lastMessageI18n` (next to `lastMessagePreview`) | `chat:list`, `chat:messages`/`chat:start` `conversation`, and the `conversation` of `chat:message`. The last message in both languages, cut to 140 characters and whitespace-collapsed exactly like `lastMessagePreview`. Absent for a photo-only last message or when unknown |

Public and guest shapes are unchanged apart from the added fields (`publicQuestion` still shows the first name only and
no ids; a hidden review is still announced to shoppers as `{ id, productId, status }`).

## Write-time flow

1. Validate the request exactly as before (ownership, limits, rate limits).
2. `translateForSave(text, hint?)` runs while the request waits. It trims the text, makes ONE `detect` call into the other
   language of `hint` (the sender's locale, chat only) or into French, learns `sourceLang`, and translates into every
   platform language that is not the source: a French text needs English, an English text needs French, an Urdu text
   needs both. It returns `{ sourceLang, others, sourceHash }`, or `null`.
3. The record is inserted/updated (the text is always stored as written).
4. `saveTranslated(kind, id, saved)` writes one machine `translations` row per other language (`writeMachine`, never over
   an author row), with `sourceHash = sha1(sourceLang + "\n" + trimmed text)`.
5. The payload is composed with `i18nFor` (one batched, chunked lookup per list, no N+1) and returned/emitted.

Editing a stored text (a replaced seller reply or answer) translates again and updates the rows in place; machine rows
of a language the new text no longer needs are removed. Rows made from an older text are never served: `i18nFor` compares
`sourceHash` with the current text.

Rows are keyed by `entityType` and `entityId` (for question and answer the QUESTION's id), with the `field` of the kind
(see the table of kinds below): review | review_reply | question | answer | chat_message | support_ticket | support_message |
dispute_message | dispute_reason | dispute_reply | dispute_resolution | exchange_reason | exchange_reply | replacement_reason |
replacement_reply.

## Failure behaviour

`translateForSave` never throws and returns `null` when translation is off, the text has no language to translate
(`shouldTranslate` false: numbers, sizes, e-mails, URLs...; the provider is not called), the daily budget
(`TRANSLATE_DAILY_CHAR_LIMIT`) would be crossed, the language is undetermined (`und`), the provider fails, or the call takes
longer than the timeout. Then the text is stored untranslated, exactly as before, with no error to the user, and the
payload simply has no i18n field. `saveTranslated` swallows and logs write failures.

## Environment

- `TRANSLATE_SAVE_TIMEOUT_MS` (default `4000`): longest a save waits for the translator. Read on every call.
- `TRANSLATE_PROVIDER`, `TRANSLATE_DAILY_CHAR_LIMIT`: unchanged.

## Cost

A text costs one `detect` call (which already returns the translation into the first target). One more `translate` call
is made only when the source is neither English nor French (it needs both), or when the source equals the first target
(a French text with no locale hint: the first target is French). Passing the sender's locale as a hint (chat does) avoids
that second call for people writing in their own language. Characters are counted against the daily budget for every
call.

## Support, disputes, returns, exchanges, replacements (added)

Same flow, same failure behaviour, same `TextI18n` shape, same "additions only" rule. The sender's account language
(`users.locale`) is the hint of the detect call (`translateForSender`), so a person writing in their own language costs one
provider call. Every client reads the new fields next to the text; none is ever required.

| Kind (`translate:text` `kind`) | Stored in (column) | `id` to send | Served as | Written by |
|---|---|---|---|---|
| `support_ticket` | `support_tickets.subject` | the ticket id | `subjectI18n` on the ticket | the opener (any role) |
| `support_message` | `support_messages.text` | the MESSAGE id (`ticket.messages[].id`) | `textI18n` on each item of `ticket.messages` | the ticket's owner or an agent |
| `dispute_message` | `dispute_messages.text` | the message id | `textI18n` on each `messages[]` item and on `dispute:message`'s `message` | customer, seller, desk, and the warehouse / customer notes made when grading or escalating |
| `dispute_reason` | `disputes.reason` | the DISPUTE id | `reasonI18n` on the dispute/return | the customer, when opening |
| `dispute_reply` | `disputes.sellerReason` | the dispute id | `sellerReasonI18n` | the seller, accepting or rejecting a return |
| `dispute_resolution` | `disputes.resolution` | the dispute id | `resolutionI18n` | an agent's own words only (see below) |
| `exchange_reason` | `exchanges.reason` | the exchange id | `reasonI18n` on the exchange | the customer (or the desk filing for them) |
| `exchange_reply` | `exchanges.sellerReason` | the exchange id | `sellerReasonI18n` | the seller / desk, approving or rejecting |
| `replacement_reason` | `replacements.reason` | the replacement id | `reasonI18n` on the replacement | the customer, or copied from the dispute it came from |
| `replacement_reply` | `replacements.sellerReason` | the replacement id | `sellerReasonI18n` | the seller / desk, approving or rejecting |

`field` of the rows: `subject` (support_ticket), `text` (support_message, dispute_message), `reason` (the three `*_reason`),
`reply` (the three `*_reply`), `resolution` (dispute_resolution).

Where they travel (all additions):

- Support: `support:list`, `support:get`, `support:open`, `support:reply`, `support:setStatus`, `support:markRead`,
  `support:assign` acks, and the live event `support:updated` (ticket owner room and the agent rooms). Customers, sellers,
  riders and agents all read the same ticket shape. `ticket.messages` stays a JSON string; each item gains `textI18n`.
- Disputes and returns: `disputes:list`, `returns:list`, `disputes:get` (and its `messages[]`), `disputes:open`,
  `disputes:reply` (returns the message with `textI18n`), `disputes:escalate`, `disputes:cancel`, `returns:respond`,
  `returns:decide`, `disputes:decide`, `disputes:resolve`, `disputes:reject`, `disputes:markReceived`, `returns:grade` acks; events `dispute:created`, `dispute:updated` (customer, desk, warehouse of a return and the sellers, whose copy still
  hides `customerId`, shows a first name and a null `authorId` on the customer's messages) and `dispute:message`
  (`{ disputeId, message }`, `message.textI18n`).
- Exchanges and replacements: `exchanges:list|mine|get|create|respond|setStatus` and `replacements:list|mine|get|create|respond|setStatus`
  acks, and the events `exchange:updated`, `replacement:updated` (ops rooms, the customer, the store with the redacted copy):
  `reasonI18n` and `sellerReasonI18n` next to `reason` and `sellerReason`.

`resolutionI18n` exists only when `resolution` is an agent's own words (an admin's typed reason when deciding, refusing or
closing). The stock phrases the server writes (`Refunded to wallet`, `Partially refunded`, `Replacement approved`,
`Rejected`, `Resolved`, `Cancelled by the customer`) are never sent to the translator: clients keep using `resolutionFr`.

Left as written (not conversation text): `replacements.condition` (a short grade), `exchanges.toName` (a product name the
customer types), `attachments`, names, addresses, phone numbers, references, and staff- or system-written reasons that are not a
conversation: review report reasons and moderation reasons, order-line and order cancellation reasons, delivery failure
reasons, campaign / flash-sale / store / rider-document rejection reasons, payout notes, warehouse exception notes. They are
still quoted in their notices as written.

### These texts are PRIVATE

`translate:text` for a kind of the new table answers only people who may read that record, checked by the service that owns
it (the same rule as the record's `get`):

| Kinds | Who may translate | Everyone else |
|---|---|---|
| `support_*` | the ticket's owner, the support agents (`support` role group) | `Nothing to translate.` |
| `dispute_*` | the customer; the seller(s) on the order (a team member acts as the store); the returns/disputes desk (`disputeDesk`); warehouse staff for the returns of their own warehouse | `Nothing to translate.` |
| `exchange_*`, `replacement_*` | the customer; the seller whose item it is; the deciding admin roles (`exchangeDecide`) and warehouse staff | `Nothing to translate.` |
| `chat_message` | the two sides of the conversation (unchanged) | `Nothing to translate.` |

A made-up id, a malformed id, a record of someone else and a kind routed to the wrong service all answer the same
`Nothing to translate.`; the provider is never called for a refusal. The generic path (`TranslationService.translateStored`
without `private`) refuses every private kind, so a new kind is safe by default.

## Notices that quote people's words (bell, push, web push)

A notice used to be stored once in English (`title`/`body`) with an optional French version (`NoticeInput.fr`, rows keyed by
the notification id). A notice whose body QUOTES somebody's text (a question, a review, a reply, a chat preview, a support or
dispute message, a return/exchange/replacement reason, a ticket subject) quoted it only in the language it was written in.
`api/src/notifications/quote.ts` builds both:

```ts
quotedNotice({ title, body: (quote, lang) => `${ref}: ${quote}`, text, i18n, max?, collapse?, type?, entityId?, extra? }): NoticeInput
```

The English `body` quotes the English version of the text, `fr` the French version (the French wording around it comes from
`frenchNotice`, like every other notice). `i18n` is the `SaveTranslation` that `translateForSave` just returned, or a `TextI18n`.
Without a translation (translator off, failed, or nothing to translate) the original is quoted in both and no `fr` is authored
(the built-in patterns then give the French as before). Applied at every call site that quotes written text: reviews, seller
replies, questions, answers, chat, support (ticket opened, replies, status, assignment), disputes and returns (opened, thread,
rejection, approval note, escalation, closed), replacements and exchanges (requested, approved/rejected). The product name in a
review/question notice is served in each language too.

Delivery follows the receiver's `users.locale` (`fr` = French, anything else English): `pushToUser` (bell, one account),
the store-staff copies (each member's own copy and language), `pushToRole` and `toAdmins` (the FCM multicast is split per
device owner's language, web push included), and the live `notification:new` / `listForUser` `NoticeView` carry
`title`/`body` (English) and `titleFr`/`bodyFr` (French) with the quote in each.

## Authored platform content is translated before it is published

Products, categories, stores (description, policies), campaigns, flash sales and CMS blocks are saved, then
`TranslationService.enqueue(type, id)` runs the translation job inline and the save WAITS for it, at most
`TRANSLATE_SAVE_TIMEOUT_MS` (default 4000, read on every call, the same variable as above). Every caller emits and returns the
record after that, composed with `present()`, so the first `product:created` / `product:updated` / `categories:updated`
carries both languages. A job that finishes inside the wait does not republish (the save publishes it); on timeout the job keeps
running in the background and republishes the record when it is done; a failing translator leaves the job pending for the 60 s
sweeper. Never an error. `autoRun = false` (tests) only queues. Admin retries and the backfill (`wait: false`) and broadcasts
(already translated synchronously) do not wait.

## `translate:text` (fallback)

It reuses the rows written at save (same `sourceHash`): asking for the other language is a cache hit, and asking for the source
language answers `same: true`, both without calling the provider. Private kinds are described above.
