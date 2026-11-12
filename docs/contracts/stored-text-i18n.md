# Stored text in both languages: reviews, replies, questions, answers, chat

Owner: the API. Companion to `docs/MULTILINGUAL-PLAN.md` §2.4. Web and app builders code against this file.
Code: `api/src/translation/translation.service.ts` (`translateForSave`, `saveTranslated`, `i18nFor`),
`api/src/content/reviews.service.ts`, `api/src/chat/chat.service.ts`.

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

Rows are keyed by `entityType` review | review_reply | question | answer | chat_message and `entityId` (for question and
answer the QUESTION's id), field `text` (`reply` for review_reply).

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

## `translate:text` (fallback)

Unchanged. It reuses the rows written at save (same `sourceHash`): asking for the other language is a cache hit, and
asking for the source language answers `same: true`, both without calling the provider.
