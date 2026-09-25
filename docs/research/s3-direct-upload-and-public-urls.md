# S3 direct uploads and stable public image URLs

Research for [#290](https://github.com/fauxparse/mechane/issues/290), part of map [#288](https://github.com/fauxparse/mechane/issues/288).
Date: 2026-08-17. Claims are cited to primary sources.

## The question

What direct-upload protocol, progress model, content-addressed key strategy, public URL shape, and cleanup/commit boundary fit immutable Show assets and a reusable future binary API?

## Headline finding

Use a private bucket and an application-controlled stable delivery URL. The backend authorizes an upload session and selects an immutable temporary key; the browser uploads directly with signed requests; the backend validates and commits the normalized object and maps its digest to `/assets/{digest}` or a CDN equivalent. Do not make provider URLs the public contract, and do not trust a browser-supplied digest as proof of content identity.

## Evidence

- AWS [presigned PUT](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) signs a specific key and request headers; the URL is a bearer token and a repeat PUT can overwrite the same key. AWS [POST policies](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-HTTPPOSTConstructPolicy.html) express expiration, key, content type, metadata, and size conditions.
- AWS [multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) is initiate → independent/retryable parts → complete; incomplete parts remain billable until completion or abort. AWS documents multipart checksums and notes that multipart SHA-256 is composite rather than a whole-object SHA-256 ([integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)).
- WHATWG [XHR upload events](https://xhr.spec.whatwg.org/#interface-xmlhttprequestupload) provide `progress`, `load`, and `loadend` with `loaded`/`total`; aggregate progress can combine completed part bytes with the active part's `loaded` bytes. S3 [CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html) must allow the exact app origin/method/headers and expose ETag/checksum headers.
- AWS recommends private storage with [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html). [Virtual-hosted URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html) differ by region and provider. MinIO supports presigned PUT/POST/GET and path-style endpoints for non-AWS deployments ([JavaScript SDK](https://docs.min.io/aistor/developers/sdk/javascript/api/), [core URL settings](https://docs.min.io/aistor/reference/aistor-server/settings/core/)).
- AWS provides [abort-incomplete-multipart lifecycle cleanup](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html); MinIO exposes incomplete-upload listing/removal in its SDK. Conditional writes such as `If-None-Match: *` can prevent accidental overwrite ([AWS conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)).

## Recommendation

- Start an authenticated upload session that records Show ownership, requested media policy, random temporary key, expiration, and allowed request conditions.
- Use presigned PUT with XHR progress for small files. Use multipart for larger files with bounded parallel parts, retryable part uploads, collected ETags/checksums, and an explicit Complete call. Exact threshold, part size, and concurrency remain product decisions.
- Abort on cancel/error and sweep stale sessions with provider lifecycle rules. After Complete, the backend validates object bytes/metadata and commits the normalized asset record. Only committed objects become gallery entries.
- Compute the canonical digest from server-verified normalized bytes. Map it to an app-controlled immutable URL such as `/assets/{digest}` or a CDN domain; resolve that URL to the private provider object. This makes AWS and MinIO endpoint differences invisible to consumers.

## Unresolved decisions

- PUT versus POST for the initial path, multipart threshold/part size/concurrency, and idempotency behavior.
- Common checksum algorithm across AWS and MinIO; whether the server streams and verifies a full-object digest before commit.
- App delivery route versus CDN, cache headers, and whether any assets are ever intentionally anonymous at the bucket layer.
- Upload-session grace period, duplicate digest races, cleanup schedule, and behavior after signed URL expiry.
- Whether the reusable Blob Storage API exposes multipart primitives or keeps them entirely behind a session-level protocol.
