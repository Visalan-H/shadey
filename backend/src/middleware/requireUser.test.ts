import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../models/User.js';
import { encrypt } from '../services/crypto.js';
import { createSession } from '../services/session.js';
import { setAuthEnv } from '../test/authEnv.js';
import { useTestDb } from '../test/mongo.js';
import { getUserToken, requireUser } from './requireUser.js';

vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
useTestDb();

const app = express();
app.use(cookieParser());
app.get('/private', requireUser, (req, res) => {
    res.json({ login: req.user!.login, token: getUserToken(req.user!) });
});

describe('requireUser', () => {
    it('401s without a session', async () => {
        const res = await request(app).get('/private');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Sign in required' });
    });

    it('401s when the session user no longer exists', async () => {
        const res = await request(app)
            .get('/private')
            .set('Cookie', `gp_session=${await createSession('0123456789abcdef01234567')}`);
        expect(res.status).toBe(401);
    });

    it('attaches the user and decrypts their token', async () => {
        const user = await User.create({ githubId: 7, login: 'hubot', avatarUrl: '', tokenEnc: encrypt('gho_x'), scopes: [] });
        const res = await request(app)
            .get('/private')
            .set('Cookie', `gp_session=${await createSession(user.id)}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ login: 'hubot', token: 'gho_x' });
    });
});
