# SVG safety and public rendering policy

Research for [#291](https://github.com/fauxparse/mechane/issues/291), part of map [#288](https://github.com/fauxparse/mechane/issues/288).
Date: 2026-08-17. Claims are cited to primary sources.

## The question

What policy can safely admit SVG into public object storage and browser rendering, while treating SVG as renderable but not raster-transformable?

## Headline finding

An SVG loaded through an HTML `<img>` can use a secure processing mode, but a directly navigated or object-embedded SVG can be dynamic and interactive. SVG-to-raster conversion is a full SVG viewer/interpreter, not a harmless image utility. Admission therefore needs server-side SVG-aware sanitization and reserialization, restrictive delivery headers, and an `<img>`-only renderer path.

## Evidence

- WHATWG's [HTML image element](https://html.spec.whatwg.org/multipage/embedded-content.html#the-img-element) treats an image as a non-interactive resource and excludes scripted SVG files from the image path.
- W3C SVG2 [processing modes](https://www.w3.org/TR/SVG2/conform.html#processing-modes) define secure static/animated modes that disable scripts, interactivity, and external references for image contexts. W3C's [embedded SVG](https://www.w3.org/TR/SVG/embedded.html#ImageElement) likewise processes nested SVG references securely.
- W3C's [URL processing rules](https://www.w3.org/TR/SVG/linking.html#processingURL-fetch) and [SVG interaction model](https://www.w3.org/TR/SVG/interact.html#SVGEvents) document external references, event handlers, hyperlinks, and script-triggering behavior. The SVG media-type guidance also calls out entity expansion, arbitrary URI references, and executable external content ([SVG MIME registration](https://www.w3.org/TR/SVGTiny12/mimereg.html)).
- W3C's [SVG conformance](https://www.w3.org/TR/SVG11/conform.html#ConformingSVGInterpreters) treats an SVG-to-raster transcoder as a viewer/interpreter. Raster transformation must not be assumed safe merely because the output is a bitmap.
- OWASP recommends allowlists, actual content validation, safe generated names, size/authentication limits, isolated public handling, and sanitization for active content ([file upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)). DOMPurify documents SVG support but warns that post-sanitize mutation and unsafe server DOM implementations defeat the guarantee ([official README](https://github.com/cure53/DOMPurify#readme)). CSP is defense-in-depth, not a substitute for validation; response headers can carry the resource policy ([CSP](https://w3c.github.io/webappsec-csp/), [HTTP headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)).

## Recommendation

- Parse SVG with external entities disabled. Apply an SVG-aware allowlist; remove scripts, event attributes, hyperlinks, `<use>`, `<foreignObject>`/HTML, unnecessary animation, external references, CSS `url()`/`@import`, fonts/images, and unsafe URL schemes. Canonicalize and reserialize the sanitized bytes before content-addressing.
- Serve the result as `image/svg+xml` with `X-Content-Type-Options: nosniff` and a restrictive response CSP (at minimum no scripts/plugins; exact `img-src`/`style-src` policy remains a product decision). Render public assets only through `<img>`, not `iframe`, `object`, or direct navigation. An isolated asset origin is preferable.
- Accept SVG as browser-renderable but do not send it through crop/resize/format conversion. Any future raster preview path needs a separately isolated renderer and security decision.

## Unresolved decisions

- Whether declarative animation, embedded `data:` images, any external references, `<foreignObject>`, or hyperlinks are ever allowed.
- Sanitizer/parser library, version pinning, update policy, and malformed/entity-bomb limits.
- Exact delivery origin, response CSP, and whether SVG is rejected when the sanitizer cannot prove safety.
- Whether a future isolated rasterizer may produce previews; this map does not assume one.
