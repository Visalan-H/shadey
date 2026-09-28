import type { Types } from 'mongoose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { PaintingModel } from '../models/Painting.js';
import { ReportModel } from '../models/Report.js';
import { User } from '../models/User.js';
import { encrypt } from '../services/crypto.js';
import { createSession } from '../services/session.js';
import { setAuthEnv } from '../test/authEnv.js';
import { useTestDb } from '../test/mongo.js';

// useTestDb already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
process.env.ADMIN_GITHUB_IDS = '9001, 9002';
useTestDb();

const revoked: string[] = [];
const github = setupServer(
    http.delete('https://api.github.com/applications/test-client-id/grant', async ({ request }) => {
        revoked.push(((await request.json()) as { access_token: string }).access_token);
        return new HttpResponse(null, { status: 204 });
    }),
);
beforeAll(() => github.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => github.resetHandlers());
afterAll(() => github.close());
beforeEach(async () => {
    revoked.length = 0;
    await Promise.all([User.deleteMany({}), PaintingModel.deleteMany({}), ReportModel.deleteMany({})]);
});

const app = createApp();

let nextId = 1;
async function signIn(login: string, githubId = nextId++) {
    const user = await User.create({ githubId, login, name: null, avatarUrl: '', tokenEnc: encrypt(`gho_${login}`), scopes: [] });
    return { user, cookie: `gp_session=${await createSession(user.id)}` };
}

async function makePainting(userId: Types.ObjectId, shareId: string, login = 'octo') {
    return PaintingModel.create({
        shareId,
        userId,
        login,
        repoOwner: login,
        repoName: `paint-${shareId}`,
        repoUrl: `https://github.com/${login}/paint-${shareId}`,
        isPrivate: false,
        text: 'HI',
        pattern: Array.from({ length: 7 }, () => [true]),
        placement: { mode: 'year', year: 2024, offset: 0 },
        shade: 4,
        perCell: 1,
        totalCommits: 7,
        cells: [{ date: '2024-01-07', level: 4, count: 1 }],
    });
}

const report = (shareId: string, body: object = {}, headers: Record<string, string> = {}) =>
    request(app).post(`/api/paintings/${shareId}/report`).set(headers).send(body);

describe('reporting a painting', () => {
    it('counts each visitor once and keeps their latest reason', async () => {
        const { user } = await signIn('octo');
        await makePainting(user._id, 'abc');
        expect((await report('abc', { reason: 'rude' }, { 'x-real-ip': '1.1.1.1' })).status).toBe(204);
        await report('abc', { reason: 'very rude' }, { 'x-real-ip': '1.1.1.1' });
        await report('abc', {}, { 'x-real-ip': '2.2.2.2' });
        const reports = await ReportModel.find({ shareId: 'abc' }).lean();
        expect(reports).toHaveLength(2);
        expect(reports.map((r) => r.reason).sort()).toEqual([undefined, 'very rude'].sort());
        // The raw IP is never stored.
        expect(JSON.stringify(reports)).not.toContain('1.1.1.1');
    });

    it('404s for unknown or taken-down paintings and rejects long reasons', async () => {
        const { user } = await signIn('octo');
        await makePainting(user._id, 'abc');
        expect((await report('nope')).status).toBe(404);
        expect((await report('abc', { reason: 'x'.repeat(501) })).status).toBe(400);
        await PaintingModel.updateOne({ shareId: 'abc' }, { status: 'hidden' });
        expect((await report('abc')).status).toBe(404);
    });
});

describe('admin review', () => {
    it('hides the admin API from everyone else', async () => {
        const { cookie } = await signIn('octo');
        expect((await request(app).get('/api/admin/reports')).status).toBe(404);
        expect((await request(app).get('/api/admin/reports').set('Cookie', cookie)).status).toBe(404);
        const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
        expect(me.body.user.admin).toBeUndefined();
    });

    it("doesn't trust a login: another account named like an admin stays out", async () => {
        const { cookie } = await signIn('boss');
        expect((await request(app).get('/api/admin/reports').set('Cookie', cookie)).status).toBe(404);
        expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.user.admin).toBeUndefined();
    });

    it('lists reports, takes a painting down and puts it back', async () => {
        const { user } = await signIn('octo');
        await makePainting(user._id, 'abc');
        await report('abc', { reason: 'rude' }, { 'x-real-ip': '1.1.1.1' });
        await report('abc', {}, { 'x-real-ip': '2.2.2.2' });
        const { cookie } = await signIn('boss', 9001);
        expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.user.admin).toBe(true);

        const list = await request(app).get('/api/admin/reports').set('Cookie', cookie);
        expect(list.body.reports).toEqual([expect.objectContaining({ shareId: 'abc', login: 'octo', count: 2, reasons: ['rude'], status: 'painted' })]);

        expect((await request(app).post('/api/admin/paintings/abc/hide').set('Cookie', cookie)).body).toEqual({ status: 'hidden' });
        expect((await request(app).get('/api/paintings/abc')).status).toBe(410);
        expect((await request(app).get('/og/abc.png')).status).toBe(404);
        expect((await request(app).post('/api/admin/paintings/abc/hide').set('Cookie', cookie)).status).toBe(409);

        expect((await request(app).post('/api/admin/paintings/abc/restore').set('Cookie', cookie)).body).toEqual({ status: 'painted' });
        expect((await request(app).get('/api/paintings/abc')).status).toBe(200);

        expect((await request(app).delete('/api/admin/reports/abc').set('Cookie', cookie)).status).toBe(204);
        expect(await ReportModel.countDocuments()).toBe(0);
    });
});

describe('DELETE /api/auth/me', () => {
    it('deletes the user, their paintings and reports, revokes the GitHub grant and signs out', async () => {
        const { user, cookie } = await signIn('octo');
        await makePainting(user._id, 'abc');
        await report('abc', {}, { 'x-real-ip': '1.1.1.1' });
        const { user: other } = await signIn('mona');
        await makePainting(other._id, 'keep', 'mona');
        // Filed by octo about someone else's painting: goes too. Mona's own report stays.
        await report('keep', { reason: 'mine' }, { Cookie: cookie });
        await report('keep', { reason: 'theirs' }, { 'x-real-ip': '3.3.3.3' });

        const res = await request(app).delete('/api/auth/me').set('Cookie', cookie);
        expect(res.status).toBe(204);
        expect(String(res.headers['set-cookie'])).toMatch(/gp_session=;/);
        expect(await User.exists({ _id: user._id })).toBeNull();
        expect(await PaintingModel.find().distinct('shareId')).toEqual(['keep']);
        expect(await ReportModel.find().distinct('reason')).toEqual(['theirs']);
        expect(revoked).toEqual(['gho_octo']);
    });

    it('still deletes the account when GitHub is down', async () => {
        github.use(http.delete('https://api.github.com/applications/test-client-id/grant', () => HttpResponse.error()));
        const { user, cookie } = await signIn('octo');
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await request(app).delete('/api/auth/me').set('Cookie', cookie)).status).toBe(204);
        expect(await User.exists({ _id: user._id })).toBeNull();
        spy.mockRestore();
    });

    it('needs a session', async () => {
        expect((await request(app).delete('/api/auth/me')).status).toBe(401);
    });
});
