---
"@voyant-travel/astro": minor
---

Render operator code injection, and resolve each page's context once.

`codeInjection` reached the page context and stopped there. Nothing rendered it,
so an operator's analytics, consent and verification tags were carried all the
way to the theme and dropped. The field was live in the contract and inert in
practice.

The integration now registers its own middleware, so injection works for every
theme — including ones written before the field existed — rather than depending
on each author remembering to render it. Forgetting would have failed silently,
which is the worst property a tag like this can have. `head` goes last in the
head, `bodyStart` immediately after the body tag, and `bodyEnd` last in the
body; anchors are matched case-insensitively and each is optional, so a document
missing one simply does not get that placement instead of having markup appended
somewhere arbitrary.

Injection never fails a page. A context that cannot be resolved during injection
leaves the response exactly as the theme rendered it, because an analytics tag is
not worth a blank storefront.

The middleware runs after the page so it splices the finished document, which
would otherwise mean resolving the same context twice per request. Resolved
contexts are now memoized per publication and release. A publication is an
immutable snapshot, so its id changing is precisely what makes an entry stale,
and keying on it is safe across requests. Failures are never memoized, or one
unreachable fetch would keep failing for every later request on that isolate.
