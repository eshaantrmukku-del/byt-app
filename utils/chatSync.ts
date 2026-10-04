/** Decide whether a Firestore chat snapshot should replace local chats. */
export function shouldHydrateRemoteChats(input: {
  isFirstSync: boolean;
  localRevision: number;
  remoteRevision: number;
  localHasContent: boolean;
  remoteHasContent: boolean;
}): boolean {
  const { isFirstSync, localRevision, remoteRevision, localHasContent, remoteHasContent } = input;
  if (isFirstSync) {
    // Prefer cloud after login. Keep a newer local thread that already has messages
    // (typed before the snapshot, or restored from the on-device cache).
    if (remoteHasContent && !(localHasContent && localRevision > remoteRevision)) return true;
    if (!remoteHasContent && !localHasContent) return true;
    return false;
  }
  return remoteRevision > localRevision;
}
