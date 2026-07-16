# Deployment

## Demo deployment

Deploy `client/` to Vercel, Netlify, or Firebase Hosting. The client works in demo mode without environment variables.

## Live deployment

1. Create a Firebase project.
2. Enable email/password and Google authentication.
3. Deploy `firestore.rules` and `storage.rules`.
4. Restrict the Firebase web API key to approved domains and APIs.
5. Deploy `server/` to a Node.js 22 host.
6. Configure the values from `.env.example`.
7. Set `VITE_API_URL` to the deployed API and rebuild the client.
8. Add the client origin to `CLIENT_URL`.
9. Run all tests and builds before production traffic.

Do not use real identity documents while testing a new Firebase configuration.
