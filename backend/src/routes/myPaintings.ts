import { Router } from 'express';
import { connectDb } from '../db.js';
import { requireUser } from '../middleware/requireUser.js';
import { PaintingModel, type Painting } from '../models/Painting.js';
import { forgetCalendars } from '../services/calendar.js';

export const router = Router();

const LIST_FIELDS = 'shareId text repoName repoUrl isPrivate status createdAt totalCommits';
const REPO_CHECK_TIMEOUT_MS = 5000;

export function toSummary(p: Pick<Painting, 'shareId' | 'text' | 'repoName' | 'repoUrl' | 'isPrivate' | 'status' | 'createdAt' | 'totalCommits'>) {
    const { shareId, text, repoName, repoUrl, isPrivate, status, createdAt, totalCommits } = p;
    return { shareId, text: text ?? null, repoName, repoUrl, isPrivate, status, createdAt, totalCommits };
}

// true = still there, false = gone, null = GitHub couldn't tell us. Unauthenticated, so a private
// repo reads as gone; that only affects the user's own list, never GitHub.
async function repoExists(owner: string, name: string): Promise<boolean | null> {
    try {
        const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
            headers: { accept: 'application/vnd.github+json', 'user-agent': 'shadey' },
            signal: AbortSignal.timeout(REPO_CHECK_TIMEOUT_MS),
        });
        if (res.status === 200) return true;
        if (res.status === 404) return false;
        return null;
    } catch {
        return null;
    }
}

router.get('/', requireUser, async (req, res) => {
    await connectDb();
    const paintings = await PaintingModel.find({ userId: req.user!._id }).select(LIST_FIELDS).sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ paintings: paintings.map(toSummary) });
});

// "Delete it myself": the user deleted the repo on GitHub and tells us so.
router.post('/:shareId/deleted', requireUser, async (req, res) => {
    await connectDb();
    const painting = await PaintingModel.findOne({ shareId: req.params.shareId, userId: req.user!._id });
    if (!painting) {
        res.status(404).json({ error: 'Painting not found' });
        return;
    }
    if (painting.status !== 'deleted') {
        if ((await repoExists(painting.repoOwner, painting.repoName)) === true) {
            res.status(409).json({ error: 'The repo still exists on GitHub' });
            return;
        }
        painting.status = 'deleted';
        await painting.save();
        await forgetCalendars(painting.login).catch((e: unknown) => console.error('Clearing cached graphs failed', e));
    }
    res.json({ painting: toSummary(painting) });
});
