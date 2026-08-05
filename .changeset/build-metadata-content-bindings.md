---
"@voyant-travel/theme": minor
---

Carry a theme's content bindings through the build metadata.

`manifest.contentBindings` was validated and then went nowhere: the build
artifact metadata is assembled field by field and never included it, so the
platform stored `null` for every release and its check that an operator's
mapping satisfies the theme ran against an empty declaration. A theme could
declare a required slot and publishing a site that never mapped it succeeded.

The key sits between `settings` and `outputDirectory`. That position is part of
what the digest commits to — it is taken over `JSON.stringify` of the metadata
— and the platform rebuilds the object in the same order to verify it. Moving
it would fail verification with identical content.

Requires a platform that already accepts the key, which shipped first for
exactly that reason.
