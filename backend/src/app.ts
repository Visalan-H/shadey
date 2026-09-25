import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { router as auth } from './routes/auth.js';
import { router as calendar } from './routes/calendar.js';
import { router as paintings } from './routes/paintings.js';
import { router as share } from './routes/share.js';

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '100kb' }));
    app.use(cookieParser());

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true });
    });

    app.use('/api/auth', auth);
    app.use('/api/calendar', calendar);
    app.use('/api/paintings', paintings);
    // Share pages (/p/:id) and share images (/og/:id.png), forwarded here by the frontend.
    app.use(share);

    app.use('/api', (_req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    // Express would otherwise render its own HTML error page; keep errors JSON and logged.
    const onError: ErrorRequestHandler = (err, _req, res, _next) => {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong' });
    };
    app.use(onError);

    return app;
}

// Vercel's Express preset uses this file's default export as the function.
export default createApp();
