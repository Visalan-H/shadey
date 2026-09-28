import { Router } from 'express';
import { connectDb } from '../db.js';
import { getUserToken, requireUser } from '../middleware/requireUser.js';
import { PaintingModel } from '../models/Painting.js';
import { UpstreamError } from '../services/calendar.js';
import { PushError } from '../services/paint/index.js';
import { checkShades, type ShadeCheckDeps } from '../services/shadeCheck.js';

// "Check shades": compare a painting with what GitHub shows now and top up days that came out light.
export function createShadeCheckRouter(deps: ShadeCheckDeps = {}) {
    const router = Router();

    router.post('/:shareId/check-shades', requireUser, async (req, res) => {
        await connectDb();
        const user = req.user!;
        const painting = await PaintingModel.findOne({ shareId: req.params.shareId, userId: user._id, status: { $ne: 'deleted' } });
        if (!painting) {
            res.status(404).json({ error: 'Painting not found' });
            return;
        }
        try {
            res.json(await checkShades(painting, user, getUserToken(user), deps));
        } catch (err) {
            if (err instanceof UpstreamError) {
                res.status(502).json({ error: err.message });
            } else if (err instanceof PushError) {
                console.error('Top-up push failed:', err.message);
                res.status(502).json({ error: "Couldn't push the extra commits. Check the repo still exists, then try again." });
            } else {
                throw err;
            }
        }
    });

    return router;
}

export const router = createShadeCheckRouter();
