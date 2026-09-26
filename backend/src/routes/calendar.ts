import { Router } from 'express';
import { z } from 'zod';
import { connectDb } from '../db.js';
import { getCalendar, UpstreamError, UserNotFoundError } from '../services/calendar.js';

export const router = Router();

// GitHub usernames: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const login = z
    .string()
    .max(39)
    .regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d]))*$/i, 'Invalid GitHub username');

const query = z.object({
    year: z.coerce
        .number()
        .int()
        .min(2008)
        .refine((y) => y <= new Date().getUTCFullYear(), 'Year is in the future')
        .optional(),
});

router.get('/:login', async (req, res) => {
    const parsedLogin = login.safeParse(req.params.login);
    const parsedQuery = query.safeParse(req.query);
    if (!parsedLogin.success || !parsedQuery.success) {
        res.status(400).json({ error: parsedLogin.success ? 'Invalid year' : 'Invalid GitHub username' });
        return;
    }

    await connectDb();
    try {
        const calendar = await getCalendar(parsedLogin.data, parsedQuery.data.year);
        res.set('Cache-Control', 'public, max-age=300');
        res.json(calendar);
    } catch (err) {
        if (err instanceof UserNotFoundError) {
            res.status(404).json({ error: 'User not found' });
        } else if (err instanceof UpstreamError) {
            res.status(502).json({ error: err.message });
        } else {
            throw err;
        }
    }
});
