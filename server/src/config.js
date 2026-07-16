export const config = {
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  firebaseConfigured: Boolean(process.env.FIREBASE_PROJECT_ID),
  maxUploadBytes: 10 * 1024 * 1024,
};
