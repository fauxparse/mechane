# Image processing pipeline: HEIC conversion and raster transforms

Research for [#289](https://github.com/fauxparse/mechane/issues/289), part of map [#288](https://github.com/fauxparse/mechane/issues/288).
Date: 2026-08-17. Claims are cited to primary sources.

## The question

Which browser-first libraries and formats can decode phone images such as HEIC, preserve EXIF orientation, crop/resize/convert within explicit limits, and produce normalized outputs without retaining originals? Which constraints must the server enforce?

## Headline finding

Browser processing is useful for immediate UX and bandwidth reduction but is not a trustworthy normalization boundary. Browser support and encoders vary by platform; `createImageBitmap()` and canvas encoding are capability-tested, not assumed. The server must decode, validate, transform, re-encode, and hash the canonical bytes before committing an Image Asset.

## Evidence

- WHATWG's [`createImageBitmap()`](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-createimagebitmap) defines source cropping, resizing, and `imageOrientation: "from-image"`, but image-format support is user-agent dependent. A representative HEIC Blob must actually be decoded; MIME presence is not proof of support.
- WHATWG canvas serialization ([`toBlob()`](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob)) requires PNG but allows other requested formats to fall back to PNG. Quality is only a desired level, and encoding can fail. Canvas normalization should therefore use an explicit allowlist and verify the returned type and bytes.
- CIPA's [Exif specification](https://www.cipa.jp/std/documents/e/DC-008-2012_E_C.pdf) defines orientation tag 274 with eight display transforms, including transforms that swap visual width and height. Normalize orientation into pixels before crop coordinates and before storing intrinsic dimensions.
- Safari 17 documents [HEIC/HEIF support](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes), demonstrating that support is platform/version-specific. [`heic2any`](https://github.com/alexcorvi/heic2any) is a browser-only fallback that converts HEIC/HEIF but does not preserve metadata; [`libheif`](https://github.com/strukturag/libheif) supports HEIF/AVIF decoding/encoding and has an Emscripten path, but codec dependencies, build size, licensing, and resource limits require decisions.
- OWASP's [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) requires allowlists, actual signature/type validation rather than trusting `Content-Type`, size limits, safe isolated processing, and protection against parser and decompression attacks. The [MIME Sniffing standard](https://mimesniff.spec.whatwg.org/#matching-an-image-type-pattern) explains why headers cannot be trusted alone.

## Recommendation

1. In the browser, feature-test native decode with a representative Blob; use a pinned HEIC fallback only when required. Apply orientation before presenting crop coordinates. Let the browser produce a preview and an upload candidate, but treat its limits and output as advisory.
2. On the server, enforce pre-decode byte limits, safe metadata parsing, maximum width/height/pixel budget, overflow protection, supported frame/image-count policy, and authenticated ownership. Decode with a pinned, maintained library in a resource-limited process; apply orientation; crop/resize; encode a single explicitly allowed normalized output; strip unneeded source metadata; verify signature, dimensions, content type, and output byte limits; then hash the canonical server bytes and commit the asset.
3. Pick a deterministic server encoder/version/configuration, including rounding, alpha behavior, color profile, quality, and chroma policy. Browser `resizeQuality` and encoders cannot provide byte-level determinism.

## Unresolved decisions

- Canonical output formats and quality/quantization policy, including alpha and color-profile handling.
- Input/output byte, dimension, and total-pixel limits; animated or multi-image HEIC behavior.
- Whether the browser fallback is `heic2any`, a pinned libheif WASM build, or another maintained decoder, including licensing and bundle-size constraints.
- Exact timing for temporary/original deletion and behavior when browser fallback support is absent.
- Whether crop coordinates are defined before or after orientation normalization (recommend after normalization).
