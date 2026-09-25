import express, { type ErrorRequestHandler } from 'express';

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '100kb' }));

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true });
    });

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
