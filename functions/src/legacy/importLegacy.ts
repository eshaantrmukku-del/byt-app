import { FieldValue, Timestamp, type BulkWriter, type DocumentReference, type Firestore } from 'firebase-admin/firestore';

import { preview, refs } from '../credits/ledger.js';

/**
 * One-time, additive copy of a prototype account into the schema-v2 collections.
 *
 * The prototype kept goals, check-ins, journal and chats as arrays on users/{uid}.
 * This copies them into the subcollections the app and the coach read, using the
 * same ids the app already shows (see src/features/profile/legacyAccount.ts), so
 * nothing duplicates. It only ever creates documents: anything already in a
 * subcollection wins, and users/{uid} itself is never modified, so the arrays stay
 * as a backup. Documents match firestore.rules exactly (no extra keys), so the
 * owner can keep editing them. The marker on private/account stops a re-run from
 * bringing back rows the user has since deleted.
 */

export const LEGACY_IMPORT_VERSION = 1;

type Data = Record<string, unknown>;

const GOAL_CATEGORIES = ['career', 'health', 'fitness', 'personal', 'finance', 'learning', 'social', 'creativity', 'other'];
const MOOD_IDS = ['energized', 'balanced', 'calm', 'anxious', 'tired', 'productive', 'focused', 'overwhelmed'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{8,64}$/;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function asRecord(value: unknown): Data | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Data) : null;
}

function list(value: unknown): Data[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Data => item !== null);
}

/** Same rule as the app: ids the callables accept are kept, anything else gets a stable prefix. */
export function legacyDocId(raw: string): string {
  const id = raw.trim();
  if (ID.test(id)) return id;
  return `legacy_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64);
}

/** A valid IANA zone, or UTC. */
export function safeTimeZone(zone: unknown): string {
  if (typeof zone !== 'string' || !zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

/** YYYY-MM-DD for a stored date, on the user's calendar (the prototype stored full ISO timestamps). */
export function legacyDateKey(value: unknown, timeZone: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (ISO_DATE.test(value)) return value;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const clip = (text: string, max: number) => text.trim().slice(0, max);

function metric(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(10, Math.max(1, n));
}

/** Prototype ids were usually Date.now() strings; use them as the creation time when they look like one. */
function idTime(id: string, fallback: number): number {
  if (!/^\d{12,13}$/.test(id)) return fallback;
  const ms = Number(id);
  return ms > Date.UTC(2020, 0, 1) && ms < fallback + 86_400_000 ? ms : fallback;
}

type Planned = { path: string; data: Data };

export type LegacyPlan = {
  goals: Planned[];
  checkIns: Planned[];
  journal: Planned[];
  conversations: Planned[];
  messages: Planned[];
};

/** Pure mapping from a prototype users/{uid} document to the documents to create. */
export function planLegacyImport(uid: string, data: Data, timeZone: string, nowMs: number): LegacyPlan {
  const base = `users/${uid}`;
  const ts = (ms: number) => Timestamp.fromMillis(ms);
  const plan: LegacyPlan = { goals: [], checkIns: [], journal: [], conversations: [], messages: [] };

  const goals = list(data.goals);
  const seenGoals = new Set<string>();
  goals.forEach((goal, index) => {
    const title = clip(str(goal.title), 200);
    const rawId = str(goal.id).trim();
    if (!title || !rawId) return;
    const id = legacyDocId(rawId);
    if (seenGoals.has(id)) return;
    seenGoals.add(id);
    const category = str(goal.category).trim().toLowerCase();
    const status = str(goal.status).trim().toLowerCase();
    const progress = typeof goal.progress === 'number' && Number.isFinite(goal.progress) ? Math.min(100, Math.max(0, Math.round(goal.progress))) : 0;
    // Keep the prototype's order when there is no usable time.
    const at = idTime(rawId, nowMs - (goals.length - index) * 1000);
    plan.goals.push({
      path: `${base}/goals/${id}`,
      data: {
        title,
        category: GOAL_CATEGORIES.includes(category) ? category : 'other',
        status: status === 'completed' ? 'completed' : status === 'paused' || status === 'stuck' ? 'paused' : 'active',
        progress,
        createdAt: ts(at),
        updatedAt: ts(at),
      },
    });
  });

  // One check-in per calendar day; a later row wins, as in the app.
  const byDate = new Map<string, Planned>();
  for (const raw of list(data.checkIns)) {
    const date = legacyDateKey(raw.date, timeZone);
    if (!date) continue;
    const moods = (Array.isArray(raw.moods) ? raw.moods : []).map((m) => str(m).trim().toLowerCase()).filter((m) => MOOD_IDS.includes(m));
    const single = str(raw.mood).trim().toLowerCase();
    if (MOOD_IDS.includes(single) && !moods.includes(single)) moods.unshift(single);
    if (moods.length === 0) moods.push('balanced');
    const reflection = clip(str(raw.reflection) || str(raw.notes), 2000);
    const win = clip(str(raw.win), 500);
    const at = idTime(str(raw.id), Date.parse(str(raw.date)) || nowMs);
    byDate.set(date, {
      path: `${base}/checkIns/${date}`,
      data: {
        date,
        moods: [...new Set(moods)].slice(0, 8),
        happiness: metric(raw.happiness, metric(raw.energy, 5)),
        stress: metric(raw.stress, 5),
        sleep: metric(raw.sleep, 5),
        ...(reflection ? { reflection } : {}),
        ...(win ? { win } : {}),
        createdAt: ts(at),
        updatedAt: ts(at),
      },
    });
  }
  plan.checkIns = [...byDate.values()];

  const seenJournal = new Set<string>();
  for (const entry of list(data.journalEntries)) {
    const text = clip(str(entry.text), 20000);
    const rawId = str(entry.id).trim();
    const date = legacyDateKey(entry.date, timeZone);
    if (!text || !rawId || !date) continue;
    const id = legacyDocId(rawId);
    if (seenJournal.has(id)) continue;
    seenJournal.add(id);
    const at = Date.parse(str(entry.date)) || idTime(rawId, nowMs);
    plan.journal.push({ path: `${base}/journal/${id}`, data: { date, text, createdAt: ts(at), updatedAt: ts(at) } });
  }

  const seenChats = new Set<string>();
  for (const chat of list(data.chats)) {
    const rawId = str(chat.id).trim();
    if (!rawId) continue;
    const id = legacyDocId(rawId);
    if (seenChats.has(id)) continue;
    const mode = chat.mode === 'reflection' ? 'reflection' : 'normal';
    const edited = chat.titleManuallyEdited === true;
    const createdAt = typeof chat.createdAt === 'number' ? chat.createdAt : nowMs;
    const messages: Planned[] = [];
    const seenMessages = new Set<string>();
    for (const message of list(chat.messages)) {
      const text = str(message.text).trim();
      const rawMessageId = str(message.id).trim();
      const role = message.sender === 'ai' ? 'coach' : message.sender === 'user' ? 'user' : null;
      if (!text || !rawMessageId || !role) continue;
      const messageId = legacyDocId(rawMessageId);
      if (seenMessages.has(messageId)) continue;
      seenMessages.add(messageId);
      const at = typeof message.timestamp === 'number' ? message.timestamp : createdAt;
      messages.push({
        path: `${base}/conversations/${id}/messages/${messageId}`,
        data: { role, text, clientTurnId: messageId, channel: 'text', createdAt: ts(at) },
      });
    }
    // Empty placeholder sessions are not worth keeping (the app skips them too).
    if (messages.length === 0 && !edited && mode === 'normal') continue;
    seenChats.add(id);
    const last = messages[messages.length - 1]?.data;
    const lastAt = (last?.createdAt as Timestamp | undefined)?.toMillis() ?? createdAt;
    const updatedAt = Math.max(typeof chat.updatedAt === 'number' ? chat.updatedAt : createdAt, lastAt);
    const reflectionCheckInId = legacyDateKey(asRecord(chat.reflectionContext)?.date, timeZone);
    plan.conversations.push({
      path: `${base}/conversations/${id}`,
      data: {
        title: clip(str(chat.title), 120) || (mode === 'reflection' ? 'Reflection discussion' : 'Coaching session'),
        mode,
        ...(mode === 'reflection' && reflectionCheckInId ? { reflectionCheckInId } : {}),
        titleEdited: edited,
        messageCount: messages.length,
        summaryMessageCount: 0,
        lastMessagePreview: last ? preview(String(last.text)) : '',
        lastMessageAt: ts(lastAt),
        createdAt: ts(createdAt),
        updatedAt: ts(updatedAt),
      },
    });
    plan.messages.push(...messages);
  }

  return plan;
}

export type LegacyImportResult =
  | { status: 'already-imported' | 'nothing-to-import' }
  | { status: 'imported'; created: number; skipped: number };

const ALREADY_EXISTS = 6;

/**
 * Runs the import once per account. Safe to call concurrently and to retry:
 * every write is create-only, and the marker is written only after all writes land.
 */
export async function importLegacyAccount(
  db: Firestore,
  uid: string,
  opts: { timeZone?: unknown; nowMs: number },
): Promise<LegacyImportResult> {
  const r = refs(db, uid);
  const [accountSnap, userSnap] = await Promise.all([r.account.get(), r.user.get()]);
  if (asRecord(accountSnap.data()?.legacyImport)) return { status: 'already-imported' };

  const plan = planLegacyImport(uid, userSnap.data() ?? {}, safeTimeZone(opts.timeZone), opts.nowMs);
  const all = [...plan.goals, ...plan.checkIns, ...plan.journal, ...plan.conversations, ...plan.messages];
  const marker = (counts: Data) => r.account.set({ legacyImport: { version: LEGACY_IMPORT_VERSION, at: FieldValue.serverTimestamp(), ...counts } }, { merge: true });

  if (all.length === 0) {
    await marker({ created: 0, skipped: 0 });
    return { status: 'nothing-to-import' };
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const writer: BulkWriter = db.bulkWriter();
  writer.onWriteError((error) => {
    if (error.code === ALREADY_EXISTS) return false;
    return error.failedAttempts < 3;
  });
  for (const item of all) {
    const ref: DocumentReference = db.doc(item.path);
    writer.create(ref, item.data).then(
      () => { created += 1; },
      (error: { code?: number }) => {
        if (error?.code === ALREADY_EXISTS) skipped += 1;
        else failed += 1;
      },
    );
  }
  await writer.close();
  if (failed > 0) throw new Error(`legacy import: ${failed} writes failed`);

  await marker({ created, skipped });
  return { status: 'imported', created, skipped };
}
