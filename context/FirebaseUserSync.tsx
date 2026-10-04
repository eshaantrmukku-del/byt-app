import { chatsStateRef, getChatsRevision, migrateChat, useChats } from '@/context/ChatsContext';
import { auth, db } from '@/services/firebase';
import { registerUserFirestoreFlush, unregisterUserFirestoreFlush } from '@/services/userFirestoreCoordinator';
import type { CheckIn, Goal, JournalEntry, MergeRemoteUserPartial, SubscriptionPlan } from '@/store/useStore';
import { isProfileFlushSuppressed, useStore, withSuppressedProfileFlush } from '@/store/useStore';
import { shouldHydrateRemoteChats } from '@/utils/chatSync';
import { coachProfileHasContent, parseCoachProfile, serializeCoachProfile } from '@/utils/coachProfilePersist';
import { onAuthStateChanged } from 'firebase/auth';
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc, type DocumentReference } from 'firebase/firestore';
import React, { useEffect, useRef } from 'react';

function sanitizeForFirestore<T extends Record<string, unknown>>(partial: T) {
  return JSON.parse(JSON.stringify(partial)) as T;
}

type CloudPayload = Record<string, unknown>;

function buildFlushPayload(): CloudPayload {
  const {
    user,
    goals,
    checkIns,
    journalEntries,
    coachProfile,
    onboardingCompleted,
    subscriptionPlan,
    creditsRemaining,
    creditsPeriodKey,
  } = useStore.getState();
  return sanitizeForFirestore({
    displayName: user?.name ?? '',
    email: user?.email ?? '',
    goals,
    checkIns,
    journalEntries,
    coachProfile: serializeCoachProfile(coachProfile),
    onboardingCompleted,
    subscriptionPlan,
    creditsRemaining,
    creditsPeriodKey,
    chats: chatsStateRef.current,
  });
}

async function writeUserDoc(ref: DocumentReference, payload: CloudPayload): Promise<boolean> {
  try {
    await setDoc(
      ref,
      {
        ...payload,
        profilePhotoUri: deleteField(),
        profilePhotoBase64: deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.warn('[FirebaseUserSync] save failed:', error);
    return false;
  }
}

export function FirebaseUserSync({ children }: { children: React.ReactNode }) {
  const { hydrateChats, resetChatsToDefault } = useChats();
  const hydrateChatsRef = useRef(hydrateChats);
  const resetChatsRef = useRef(resetChatsToDefault);

  hydrateChatsRef.current = hydrateChats;
  resetChatsRef.current = resetChatsToDefault;

  const uidRef = useRef<string | null>(null);
  /** True only after the first Firestore snapshot for the current uid has been applied. */
  const syncReadyRef = useRef(false);
  const applyingRemote = useRef(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushSig = useRef('');
  /** Local edits that have not been confirmed in Firestore yet. */
  const pendingLocalRef = useRef(false);
  const saveAttempts = useRef(0);
  /** One cleanup write per signed-in session so a leftover photo field cannot flush forever. */
  const legacyPhotoFlushRef = useRef(false);
  const scheduleFlushRef = useRef<() => void>(() => {});
  const flushNowRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    const t = setTimeout(() => useStore.getState().setFirebaseAuthReady(true), 10000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!db) {
      return;
    }

    const fsdb = db;

    const flushToCloud = async (): Promise<boolean> => {
      const uid = uidRef.current;
      // Never write before first remote hydrate — empty local defaults would wipe cloud chats.
      if (!uid || applyingRemote.current || !syncReadyRef.current) return false;

      const payload = buildFlushPayload();

      const saved = await writeUserDoc(doc(fsdb, 'users', uid), payload);
      if (saved) {
        lastFlushSig.current = JSON.stringify(payload);
        pendingLocalRef.current = false;
        saveAttempts.current = 0;
        return true;
      }

      saveAttempts.current += 1;
      if (saveAttempts.current < 3) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          void flushToCloud();
        }, 1500 * saveAttempts.current);
      }
      return false;
    };

    const scheduleFlush = () => {
      if (!uidRef.current) return;
      // Queue the write. Calling this during a snapshot used to return and drop the save.
      if (!syncReadyRef.current || applyingRemote.current) {
        pendingLocalRef.current = true;
        return;
      }
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        void flushToCloud();
      }, 550);
    };

    const flushNow = async () => {
      const start = Date.now();
      while (
        (!syncReadyRef.current || applyingRemote.current) &&
        uidRef.current &&
        Date.now() - start < 4000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return flushToCloud();
    };

    scheduleFlushRef.current = scheduleFlush;
    flushNowRef.current = flushNow;
    registerUserFirestoreFlush(scheduleFlush, flushNow);

    const unsubStore = useStore.subscribe(() => {
      if (!uidRef.current || applyingRemote.current || isProfileFlushSuppressed()) return;
      const sig = JSON.stringify(buildFlushPayload());
      if (sig === lastFlushSig.current) return;
      pendingLocalRef.current = true;
      if (!syncReadyRef.current) return;
      scheduleFlush();
    });

    return () => {
      unregisterUserFirestoreFlush();
      unsubStore();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!auth || !db) {
      useStore.getState().setFirebaseAuthReady(true);
      return;
    }

    const fsdb = db;

    let unsubDoc: undefined | (() => void);
    let authGen = 0;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      const gen = ++authGen;
      unsubDoc?.();
      unsubDoc = undefined;

      const { logout, login, mergeRemoteUserState, setFirebaseAuthReady } = useStore.getState();

      if (!firebaseUser) {
        // Capture payload synchronously before any await / UI logout() can clear store or chats.
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        if (retryTimer.current) {
          clearTimeout(retryTimer.current);
          retryTimer.current = null;
        }
        const uid = uidRef.current;
        const shouldFlush = !!(uid && syncReadyRef.current);
        const logoutPayload = shouldFlush ? buildFlushPayload() : null;

        uidRef.current = null;
        syncReadyRef.current = false;
        pendingLocalRef.current = false;
        legacyPhotoFlushRef.current = false;
        lastFlushSig.current = '';
        logout();
        resetChatsRef.current();
        setFirebaseAuthReady(true);

        if (shouldFlush && logoutPayload && uid) {
          const ref = doc(fsdb, 'users', uid);
          void writeUserDoc(ref, logoutPayload).catch((e) => {
            console.warn('[FirebaseUserSync] logout save failed:', e);
          });
        }
        return;
      }

      // New signed-in session: block flushes until remote snapshot is applied.
      syncReadyRef.current = false;
      lastFlushSig.current = '';
      uidRef.current = firebaseUser.uid;

      const name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
      const email = firebaseUser.email ?? '';
      withSuppressedProfileFlush(() => {
        login(name, email, firebaseUser.uid);
      });
      setFirebaseAuthReady(true);

      const ref = doc(fsdb, 'users', firebaseUser.uid);
      unsubDoc = onSnapshot(
        ref,
        (snapshot) => {
          if (uidRef.current !== firebaseUser.uid || gen !== authGen) return;

          if (!snapshot.exists()) {
            applyingRemote.current = true;
            try {
              // First account doc: local state (incl. chats) becomes the seed.
              syncReadyRef.current = true;
            } finally {
              applyingRemote.current = false;
            }
            void flushNowRef.current();
            return;
          }

          applyingRemote.current = true;
          let flushAfterApply = false;
          try {
            const data = snapshot.data() as Record<string, unknown>;
            const partial: MergeRemoteUserPartial = {};
            const isFirstSyncForUid = !syncReadyRef.current;
            const local = useStore.getState();
            const pending = pendingLocalRef.current;

            const keepPendingEdits = pending && !isFirstSyncForUid;

            if (!keepPendingEdits && Array.isArray(data.goals)) partial.goals = data.goals as Goal[];
            if (!keepPendingEdits && Array.isArray(data.checkIns)) partial.checkIns = data.checkIns as CheckIn[];
            if (!keepPendingEdits && Array.isArray(data.journalEntries)) {
              partial.journalEntries = data.journalEntries as JournalEntry[];
            }

            // Prefer a contentful local coach profile over a null/empty remote echo
            // (seed write / race after onboarding) so intake fields are not wiped.
            // After the first snapshot, unsaved edits also win over an older cloud copy.
            if (!keepPendingEdits && 'coachProfile' in data) {
              const remoteProfile = parseCoachProfile(data.coachProfile);
              if (coachProfileHasContent(remoteProfile) || !coachProfileHasContent(local.coachProfile)) {
                partial.coachProfile = remoteProfile;
              }
            }
            if (typeof data.onboardingCompleted === 'boolean') {
              const keepLocalOnboarding =
                pending && local.onboardingCompleted === false && data.onboardingCompleted === true;
              // Don't let a stale "completed" seed overwrite in-progress onboarding.
              if (
                !keepLocalOnboarding &&
                !(isFirstSyncForUid && local.onboardingCompleted === false && data.onboardingCompleted === true)
              ) {
                partial.onboardingCompleted = data.onboardingCompleted;
              }
            }
            if (!keepPendingEdits && typeof data.displayName === 'string' && data.displayName.trim()) {
              partial.displayName = data.displayName.trim();
            }
            if ('subscriptionPlan' in data) {
              partial.subscriptionPlan = (data.subscriptionPlan as SubscriptionPlan) || 'standard';
            }
            if (typeof data.creditsRemaining === 'number') partial.creditsRemaining = data.creditsRemaining;
            if (typeof data.creditsPeriodKey === 'string') partial.creditsPeriodKey = data.creditsPeriodKey;

            mergeRemoteUserState(partial);

            const rawChats = data.chats;
            if (Array.isArray(rawChats)) {
              const migrated = rawChats.map(migrateChat);
              const remoteRevision = getChatsRevision(migrated);
              const localRevision = getChatsRevision(chatsStateRef.current);
              const localHasContent = chatsStateRef.current.some((c) => c.messages.length > 0);
              const remoteHasContent = migrated.some((c) => c.messages.length > 0);

              const shouldHydrate = shouldHydrateRemoteChats({
                isFirstSync: isFirstSyncForUid,
                localRevision,
                remoteRevision,
                localHasContent,
                remoteHasContent,
              });

              if (shouldHydrate) {
                hydrateChatsRef.current(rawChats);
              } else if (
                isFirstSyncForUid &&
                localHasContent &&
                (!remoteHasContent || localRevision > remoteRevision)
              ) {
                // Newer local messages (typed before this snapshot, or restored from cache)
                // must be uploaded. They are not a zustand edit, so mark them pending.
                pendingLocalRef.current = true;
              }
            }

            syncReadyRef.current = true;
            const hasLegacyPhoto = 'profilePhotoUri' in data || 'profilePhotoBase64' in data;
            if (hasLegacyPhoto && !legacyPhotoFlushRef.current) {
              legacyPhotoFlushRef.current = true;
              flushAfterApply = true;
            }
            if (pendingLocalRef.current) {
              flushAfterApply = true;
            } else if (!flushAfterApply) {
              lastFlushSig.current = JSON.stringify(buildFlushPayload());
            }
          } finally {
            applyingRemote.current = false;
          }
          if (flushAfterApply) scheduleFlushRef.current();
        },
        (err) => {
          console.warn('[FirebaseUserSync] snapshot error:', err);
          // Allow local edits to sync even if the first read failed.
          syncReadyRef.current = true;
          useStore.getState().setFirebaseAuthReady(true);
          if (pendingLocalRef.current) scheduleFlushRef.current();
        }
      );
    });

    return () => {
      authGen += 1;
      unsubDoc?.();
      unsubAuth();
    };
  }, []);

  return <>{children}</>;
}
