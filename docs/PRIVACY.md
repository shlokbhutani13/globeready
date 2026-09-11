# Privacy

The checked-in demo stores only sample profile data and document metadata in browser memory. It does not upload files or contact Gemini.

A live deployment can process personal and identity documents through Firebase Storage and optional Gemini RAG. The API sends extracted PDF sections to Gemini for embeddings and sends retrieved sections for answer generation. It stores text chunks and embeddings in the document owner's private Firestore tree. The operator must publish a privacy notice that explains these transfers, retention, deletion, and service providers.

Deleting a document through GlobeReady removes its Storage file, Firestore metadata, and RAG chunks. The production operator still needs a documented backup-retention and account-deletion process.

Never log ID tokens, document content, passport numbers, visa numbers, or API credentials.
