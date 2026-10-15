import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, firebaseConfigured, zeroCostPublicMode } from "./firebase";
import { reauthenticateForDeletion, signInProviders } from "./reauthenticate";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  // Firebase mutates the user object on reload() without an auth-state event, so verification is tracked here.
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setEmailVerified(Boolean(nextUser?.emailVerified));
      setLoading(false);
    });
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    firebaseConfigured,
    signInEmail: (email, password) => signInWithEmailAndPassword(auth, email, password),
    emailVerified,
    signUpEmail: async (email, password) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      // The zero-cost rules only accept writes from verified addresses, so the link is sent immediately.
      if (zeroCostPublicMode) await sendEmailVerification(credential.user).catch(() => {});
      return credential;
    },
    sendVerificationEmail: () => sendEmailVerification(auth.currentUser),
    // Reloads the account and refreshes the ID token so Firestore rules see email_verified right away.
    refreshVerification: async () => {
      await reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      setEmailVerified(Boolean(auth.currentUser?.emailVerified));
      return Boolean(auth.currentUser?.emailVerified);
    },
    signInProviders: () => signInProviders(auth?.currentUser),
    reauthenticateForDeletion: (password) => reauthenticateForDeletion({ user: auth.currentUser, password }),
    signInGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
    hasGoogleProvider: () => Boolean(auth?.currentUser?.providerData?.some((provider) => provider.providerId === "google.com")),
    reauthenticateGoogle: () => reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider()),
    deleteCurrentUser: () => deleteUser(auth.currentUser),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    signOutUser: () => signOut(auth),
  }), [user, loading, emailVerified]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
