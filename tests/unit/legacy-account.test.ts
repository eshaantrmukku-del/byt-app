import { describe, expect, it } from 'vitest';

import { legacyAccount, legacyChats, legacyCheckIns, legacyGoals, legacyJournal } from '@/features/profile/legacyAccount';
import { decideProfileSnapshot } from '@/features/profile/hydration';
import { composeItems, useUserDataStore } from '@/stores/userDataStore';

const prototypeDoc = {
  displayName: 'Eshaan',
  email: 'esh@example.com',
  onboardingCompleted: true,
  coachProfile: { profession: 'Student', goalsSummary: 'Ship BYT', lifestyleNotes: 'Early mornings' },
  subscriptionPlan: 'standard',
  creditsRemaining: 120,
  creditsPeriodKey: '2026-10',
  goals: [
    { id: 'g1', title: 'Run a 5k', category: 'Fitness', status: 'Active', progress: 40 },
    { id: 'g2', title: 'Read daily', category: 'Learning', status: 'Completed', progress: 100 },
  ],
  checkIns: [
    {
      id: '1000',
      date: '2026-10-08T18:00:00.000Z',
      mood: 'energized',
      happiness: 8,
      stress: 3,
      sleep: 7,
      reflection: 'Good day',
      win: 'Shipped',
    },
  ],
  journalEntries: [{ id: 'j1', date: '2026-10-08T18:05:00.000Z', text: 'Noted.' }],
  chats: [
    {
      id: '1',
      title: 'Coaching session',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
      mode: 'normal',
      openingComplete: false,
    },
    {
      id: 'c2',
      title: 'Monday',
      messages: [
        { id: 'm1', text: 'Hello', sender: 'user', timestamp: 10 },
        { id: 'm2', text: 'Hi there', sender: 'ai', timestamp: 11 },
      ],
      createdAt: 10,
      updatedAt: 11,
      mode: 'normal',
      titleManuallyEdited: true,
    },
  ],
};

describe('legacy account on the user document', () => {
  it('shows the stored profile without waiting for an upgrade', () => {
    const decision = decideProfileSnapshot({ exists: true, fromCache: true, data: prototypeDoc });
    expect(decision.kind).toBe('ready');
    if (decision.kind !== 'ready') return;
    expect(decision.profile).toMatchObject({
      displayName: 'Eshaan',
      profession: 'Student',
      goalsSummary: 'Ship BYT',
      lifestyle: 'Early mornings',
      onboardingCompleted: true,
    });
    expect(decision.upgrade).toBeUndefined();
  });

  it('reads goals, check-ins, journal, credits and real chats', () => {
    expect(legacyGoals(prototypeDoc).map((g) => [g.title, g.category, g.status])).toEqual([
      ['Run a 5k', 'fitness', 'active'],
      ['Read daily', 'learning', 'completed'],
    ]);
    expect(legacyCheckIns(prototypeDoc)[0]).toMatchObject({
      id: '2026-10-08',
      moods: ['energized'],
      happiness: 8,
      reflection: 'Good day',
    });
    // Short prototype ids get the same prefix the backend import uses.
    expect(legacyJournal(prototypeDoc)).toMatchObject([{ id: 'legacy_j1', text: 'Noted.' }]);
    expect(legacyAccount(prototypeDoc)).toMatchObject({ creditsRemaining: 120, creditsPeriodKey: '2026-10', plan: 'standard' });
    const chats = legacyChats(prototypeDoc);
    expect(chats).toHaveLength(1);
    expect(chats[0]?.conversation.title).toBe('Monday');
    expect(chats[0]?.conversation.id).toBe('legacy_c2');
    expect(chats[0]?.messages.map((m) => m.role)).toEqual(['user', 'coach']);
  });
});

describe('prototype rows next to subcollection rows', () => {
  const row = (id: string, title = id) => ({ id, title });

  it('keeps old rows visible when the first new row arrives, until the import has run', () => {
    expect(composeItems([row('a'), row('b')], null, false).map((r) => r.id)).toEqual(['a', 'b']);
    expect(composeItems([row('a'), row('b')], [row('new')], false).map((r) => r.id)).toEqual(['new', 'a', 'b']);
    // Server wins on the same id.
    expect(composeItems([row('a', 'old')], [row('a', 'edited')], false)).toEqual([row('a', 'edited')]);
    // After the import, a row deleted on the server stays deleted.
    expect(composeItems([row('a'), row('b')], [row('b')], true).map((r) => r.id)).toEqual(['b']);
    // Until the server answers, the old rows are all there is.
    expect(composeItems([row('a')], null, true).map((r) => r.id)).toEqual(['a']);
  });

  it('switches to server rows once told the import is done', () => {
    const store = useUserDataStore.getState();
    store.reset();
    store.begin('u1');
    store.setItems('u1', 'goals', legacyGoals(prototypeDoc), 'legacy');
    expect(useUserDataStore.getState().goals).toMatchObject({ status: 'ready', origin: 'legacy' });
    store.setItems('u1', 'goals', [], 'server');
    expect(useUserDataStore.getState().goals.items.map((g) => g.id)).toEqual(['g1', 'g2'].map((id) => `legacy_${id}`));
    useUserDataStore.getState().setLegacyImported('u1');
    expect(useUserDataStore.getState().goals).toMatchObject({ status: 'ready', origin: 'server', items: [] });
    // Another user's late callback changes nothing.
    useUserDataStore.getState().setItems('u2', 'goals', legacyGoals(prototypeDoc), 'legacy');
    expect(useUserDataStore.getState().goals.items).toEqual([]);
  });
});
