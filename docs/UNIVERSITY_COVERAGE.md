# University coverage registry

The registry records links a human checked on an institution's official site. It is not a directory of every university,
and a registry entry does not mean GlobeReady represents, endorses, or partners with the institution.

## Add a reviewed university

1. Confirm the institution's canonical official domain independently. Do not infer it from a student-entered link.
2. Check each office URL over HTTPS. Use one of the supported office types: `international`, `dso`, `career`, `health`,
   `safety`, `housing`, `registrar`, or `tax`.
3. Keep links on the official domain or a subdomain. An official external government or vendor system needs a short
   `allowedExternalReason` explaining why it is legitimate.
4. Add the stable slug ID, official name, lowercase domain, real `reviewedOn` calendar date, and checked office links to
   `client/src/data/university-coverage.js`. Do not add unverified links just to increase coverage.
5. Validate and test:

   ```bash
   cd server
   npm run university:validate
   npm test -- tests/university-coverage-artifact.test.js
   cd ../client
   NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/university-registry.test.js src/__tests__/applies-university.test.js
   ```

Duplicate IDs, invalid or non-normalized domains, impossible or future review dates, non-HTTPS URLs, unknown office
types, oversized fields, extra fields, and unexplained off-domain links fail validation.

## Product labels and re-review

- Checked links say **Reviewed by GlobeReady** and show the review date.
- Searches generated from a domain say **Not reviewed**.
- Saved links and contacts say **Entered by you**.
- Federal update relevance is a tag match and never counts as university review.
- If a page disappears or redirects, remove or correct the registry link after review; do not silently retain the old
  claim. Until re-reviewed, students fall back to labelled official-domain searches or general resources.

The production registry is intentionally empty until real links have been independently checked. Tests use fixtures and
must not call live university sites.

