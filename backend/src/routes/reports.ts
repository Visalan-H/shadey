import { createHash } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { connectDb } from '../db.js';
import { env } from '../env.js';
import { loadSessionUser, requireAdmin } from '../middleware/requireUser.js';
import { PaintingModel } from '../models/Painting.js';
import { ReportModel } from '../models/Report.js';

export const router = Router();

const reportBody = z.object({ reason: z.string().trim().max(500).optional() });

// Vercel puts the visitor's address in x-real-ip; the hash keeps the raw IP out of the database.
function visitorKey(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = req.headers['x-real-ip'] ?? (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined) ?? req.socket.remoteAddress ?? '';
    return `ip:${createHash('sha256').update(`${env().SESSION_SECRET}:${String(ip).trim()}`).digest('hex')}`;
}

router.post('/api/paintings/:shareId/report', async (req, res) => {
    const parsed = reportBody.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ error: 'Keep the reason under 500 characters' });
        return;
    }
    await connectDb();
    const painting = await PaintingModel.exists({ shareId: req.params.shareId, status: 'painted' });
    if (!painting) {
        res.status(404).json({ error: 'Painting not found' });
        return;
    }
    const user = await loadSessionUser(req);
    const reporterKey = user ? `user:${user.id}` : visitorKey(req);
    await ReportModel.updateOne(
        { shareId: req.params.shareId, reporterKey },
        { $set: { reason: parsed.data.reason || undefined } },
        { upsert: true },
    );
    res.status(204).end();
});

// Reported paintings, most recently reported first.
router.get('/api/admin/reports', requireAdmin, async (_req, res) => {
    await connectDb();
    const groups = await ReportModel.aggregate<{ _id: string; count: number; lastAt: Date; reasons: (string | null)[] }>([
        { $sort: { updatedAt: -1 } },
        { $group: { _id: '$shareId', count: { $sum: 1 }, lastAt: { $first: '$updatedAt' }, reasons: { $push: '$reason' } } },
        { $sort: { lastAt: -1 } },
        { $limit: 200 },
    ]);
    const paintings = await PaintingModel.find({ shareId: { $in: groups.map((g) => g._id) } })
        .select('shareId login text status')
        .lean();
    const byId = new Map(paintings.map((p) => [p.shareId, p]));
    res.json({
        reports: groups.flatMap((g) => {
            const p = byId.get(g._id);
            if (!p) return [];
            return [
                {
                    shareId: g._id,
                    login: p.login,
                    text: p.text ?? null,
                    status: p.status,
                    count: g.count,
                    lastAt: g.lastAt,
                    reasons: g.reasons.filter((r): r is string => Boolean(r)).slice(0, 5),
                },
            ];
        }),
    });
});

// hide takes the share page and image down; restore puts them back. The repo on GitHub is the
// owner's and stays either way.
router.post('/api/admin/paintings/:shareId/:action', requireAdmin, async (req, res) => {
    const { shareId, action } = req.params;
    if (action !== 'hide' && action !== 'restore') {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    await connectDb();
    const from = action === 'hide' ? 'painted' : 'hidden';
    const to = action === 'hide' ? 'hidden' : 'painted';
    const painting = await PaintingModel.findOneAndUpdate({ shareId, status: from }, { status: to }, { returnDocument: 'after' });
    if (!painting) {
        res.status(409).json({ error: `Only a ${from} painting can be ${action === 'hide' ? 'hidden' : 'restored'}` });
        return;
    }
    res.json({ status: painting.status });
});

// Dismiss: the painting is fine, so clear its reports.
router.delete('/api/admin/reports/:shareId', requireAdmin, async (req, res) => {
    await connectDb();
    await ReportModel.deleteMany({ shareId: req.params.shareId });
    res.status(204).end();
});
