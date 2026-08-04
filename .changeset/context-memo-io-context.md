---
"@voyant-travel/astro": patch
---

Never cache a resolved context as a promise.

`0.1.0-alpha.5` memoized the in-flight promise so that the page and the
injection middleware would resolve a page's context with one fetch. A promise
returned by `fetch` owns the request's I/O context, and Cloudflare Workers
refuses to await one outside the request that created it, so the first request
an isolate served succeeded and every request after it failed with
"Cannot perform I/O on behalf of a different request" — a 500 with an empty
body.

Local development never showed it: fixtures resolve without any I/O, so the
whole class of failure is invisible until a published site serves a second
request.

Only the settled context is stored now. It is plain parsed data with nothing
attached to a request, so reusing it across requests is safe, and it is still
sound to keep because a publication is an immutable snapshot whose id changes
whenever its content does. Resolutions that overlap now each fetch, which is the
cost of holding no promise; the common case, a page and then the middleware
within one request, still costs one.
