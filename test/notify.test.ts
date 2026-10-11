import { describe, expect, it } from 'vitest';
import { actions, emptyData, exportBackup, parseBackup, replan, type PushState } from '../src/app/model';
import { encryptNotes, fingerprint, notifications } from '../src/app/notify';
import { decryptPayload } from '../src/push/webpush';
import { fromB64url, toB64url } from '../src/push/b64';
import { BLOCKS, LOCATIONS, MON, TUE, T, task } from './fixtures';

const NOW = T(MON, '15:00');
const setup = () => {
  let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
  d = actions.saveTask(d, task({ id: 'a', title: 'Chem worksheet', estimateMin: 35, due: T(TUE, '23:59') }), NOW);
  return d;
};

describe('notifications', () => {
  it('one notification per planned assignment at its start time, with the due date', () => {
    const n = notifications(setup(), NOW).find((x) => x.taskId === 'a')!;
    expect(n.at).toBe(T(MON, '17:45'));
    expect(n.title).toBe('Chem worksheet');
    expect(n.body).toMatch(/^Start now · 5:45pm–6:20pm \(35m\)\nDue Tue, Oct 13, 11:59\s?pm$/i);
  });

  it('laundry steps notify too; started or finished tasks do not', () => {
    let d = setup();
    d = actions.startTask(d, 'a', T(MON, '17:45'));
    const notes = notifications(d, NOW);
    expect(notes.some((x) => x.taskId === 'a')).toBe(false);
    expect(notes.map((x) => x.title)).toEqual(['Put laundry in washer', 'Move laundry to dryer', 'Take laundry out of dryer']);
  });

  it('the fingerprint changes when the plan changes, not as time passes within the day', () => {
    const d = setup();
    expect(fingerprint(notifications(d, NOW))).toBe(fingerprint(notifications(d, T(MON, '20:00'))));
    const d2 = actions.saveTask(d, task({ id: 'b', estimateMin: 20 }), NOW);
    expect(fingerprint(notifications(d2, NOW))).not.toBe(fingerprint(notifications(d, NOW)));
  });

  it('only future notifications are uploaded, encrypted so only this phone can read them', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const push = { p256dh: toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: toB64url(auth) };
    const notes = notifications(setup(), NOW);
    const items = await encryptNotes(notes, push, T(MON, '18:00'));
    expect(items.length).toBe(notes.length - 1); // the 5:45pm one has passed
    const first = JSON.parse(new TextDecoder().decode(await decryptPayload(fromB64url(items[0].body), ua, auth)));
    expect(first.title).toBe('Put laundry in washer');
    expect(items[0].body).not.toContain('laundry');
  });

  it('backups never include this phone’s notification keys, and importing keeps them', () => {
    const push: PushState = { url: 'https://x', deviceId: 'd', secret: 's', p256dh: 'p', auth: 'a', uploaded: null, uploadedAt: null, error: null };
    const d = { ...setup(), push };
    const text = exportBackup(d, NOW);
    expect(text).not.toContain('"secret"');
    expect(parseBackup(text, NOW, d).push).toEqual(push);
    expect(parseBackup(text, NOW).push).toBeNull();
  });

  it('old saves with the removed Reminders sync data load cleanly', () => {
    const text = JSON.stringify({ app: 'schedule-app-planner', data: { sync: { payload: 'x' }, tasks: [] } });
    expect('sync' in parseBackup(text, NOW)).toBe(false);
  });
});
