# Privacy

The checked-in demo stores only sample profile data and document metadata in browser memory. It does not upload files or contact Gemini.

A live deployment can process personal and identity documents through Firebase Storage and optional Gemini analysis. The operator must publish a privacy notice that explains retention, deletion, service providers, and when GlobeReady sends document content to Gemini.

Users can delete files and their Firestore metadata from the document vault. The production operator still needs a documented backup-retention and account-deletion process.

Never log ID tokens, document content, passport numbers, visa numbers, or API credentials.
