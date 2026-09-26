import { Router } from 'express';
import { nanoid } from 'nanoid';
import { Octokit } from 'octokit';
import { z } from 'zod';
import { connectDb } from '../db.js';
import { env } from '../env.js';
import { getUserToken, requireUser } from '../middleware/requireUser.js';
import { PaintingModel } from '../models/Painting.js';
import { forgetCalendars } from '../services/calendar.js';
import { checkText } from '../services/moderation.js';
import {
    InvalidRepoNameError,
    paint,
    PlanError,
    PushError,
    RepoNameTakenError,
    validateRepoName,
} from '../services/paint/index.js';
import { consumePaint, refundPaint } from '../services/rateLimit.js';

export interface PaintingsDeps {
    // Overridable for tests, which can't reach GitHub.
    octokit?: (token: string) => Octokit;
    gitBaseUrl?: string;
    pushRetryDelaysMs?: number[];
}

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function isRealDate(s: string): boolean {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const planDay = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must look like YYYY-MM-DD')
        .refine(isRealDate, 'Not a real date')
        // Compared as strings: YYYY-MM-DD sorts chronologically.
        .refine((d) => d <= todayUtc(), 'Dates cannot be in the future'),
    count: z.number().int().min(1).max(500),
});

const body = z.object({
    text: z.string().max(200).optional(),
    pattern: z
        .array(z.array(z.boolean()).min(1).max(60))
        .length(7, 'Pattern must have 7 rows')
        .refine((rows) => rows.every((r) => r.length === rows[0]!.length), 'Pattern rows must be the same length'),
    placement: z
        .object({
            mode: z.enum(['rolling', 'year']),
            year: z
                .number()
                .int()
                .min(2008)
                .refine((y) => y <= new Date().getUTCFullYear(), 'Year is in the future')
                .optional(),
            offset: z.number().int().min(0),
        })
        .refine((p) => p.mode !== 'year' || p.year !== undefined, { message: 'Year is required', path: ['year'] }),
    shade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    perCell: z.number().int().min(1).max(500),
    plan: z
        .array(planDay)
        .min(1, 'Nothing to paint')
        .max(400)
        .refine((plan) => new Set(plan.map((d) => d.date)).size === plan.length, 'Plan dates must be unique'),
    repoName: z.string(),
    isPrivate: z.boolean(),
});

function describeIssue(err: z.ZodError): string {
    const issue = err.issues[0];
    if (!issue) return 'Invalid request';
    const where = issue.path.join('.');
    return where ? `${where}: ${issue.message}` : issue.message;
}

// Maps a failed paint to a response; the user's quota has already been refunded.
function paintFailure(err: unknown): { status: number; body: Record<string, unknown> } {
    if (err instanceof PlanError) return { status: 400, body: { error: err.message } };
    if (err instanceof InvalidRepoNameError) return { status: 400, body: { error: err.message, field: 'repoName' } };
    if (err instanceof RepoNameTakenError) return { status: 409, body: { error: err.message, field: 'repoName' } };
    if (err instanceof PushError) {
        console.error(err);
        const leftover = err.repoLeftBehind && err.repoUrl;
        return {
            status: 502,
            body: {
                error: leftover
                    ? `Could not push the painting to GitHub. A partial repository was left at ${err.repoUrl}; you may want to delete it before trying again.`
                    : 'Could not push the painting to GitHub. Please try again.',
                ...(leftover ? { repoUrl: err.repoUrl } : {}),
            },
        };
    }
    const status = (err as { status?: unknown }).status;
    if (status === 401) return { status: 401, body: { error: 'GitHub sign-in expired, please sign in again' } };
    console.error(err);
    if (status === 403) {
        return { status: 502, body: { error: 'GitHub refused to create the repository. Check your account permissions and try again.' } };
    }
    return { status: 502, body: { error: 'Could not create the repository on GitHub. Please try again.' } };
}

export function createPaintingsRouter(deps: PaintingsDeps = {}) {
    const router = Router();

    router.post('/', requireUser, async (req, res) => {
        const parsed = body.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: describeIssue(parsed.error) });
            return;
        }
        const input = parsed.data;
        const user = req.user!;

        if (input.text) {
            const check = checkText(input.text);
            if (!check.ok) {
                res.status(400).json({ error: check.reason });
                return;
            }
        }
        const badName = validateRepoName(input.repoName);
        if (badName) {
            res.status(400).json({ error: badName, field: 'repoName' });
            return;
        }
        if (input.isPrivate && !user.scopes.includes('repo')) {
            res.status(403).json({ error: 'Private repos need extra permission', needScope: 'repo' });
            return;
        }

        const quota = await consumePaint(user.id);
        if (!quota.ok) {
            res.status(429).json({
                error: 'You have painted the maximum number of times today. Please try again later.',
                retryAfterSeconds: quota.retryAfterSeconds,
            });
            return;
        }

        const { APP_URL } = env();
        const shareId = nanoid(10);
        const token = getUserToken(user);
        let result;
        try {
            result = await paint({
                token,
                user: { login: user.login, githubId: user.githubId, name: user.name },
                repoName: input.repoName,
                isPrivate: input.isPrivate,
                text: input.text,
                plan: input.plan,
                appUrl: APP_URL,
                shareUrl: `${APP_URL}/p/${shareId}`,
                octokit: deps.octokit?.(token),
                gitBaseUrl: deps.gitBaseUrl,
                pushRetryDelaysMs: deps.pushRetryDelaysMs,
            });
        } catch (err) {
            await refundPaint(user.id).catch((e: unknown) => console.error('Refund failed', e));
            const failure = paintFailure(err);
            res.status(failure.status).json(failure.body);
            return;
        }

        try {
            await PaintingModel.create({
                shareId,
                userId: user._id,
                login: user.login,
                repoOwner: result.repo.owner,
                repoName: result.repo.name,
                repoUrl: result.repo.htmlUrl,
                isPrivate: input.isPrivate,
                text: input.text,
                pattern: input.pattern,
                placement: input.placement,
                shade: input.shade,
                perCell: input.perCell,
                totalCommits: result.commitCount,
                cells: input.plan.map((d) => ({ date: d.date, level: input.shade, count: d.count })),
            });
        } catch (err) {
            // The repo is on GitHub already, so point the user at it even without a share page.
            console.error(err);
            res.status(500).json({
                error: 'Your painting was pushed but could not be saved for sharing',
                repoUrl: result.repo.htmlUrl,
            });
            return;
        }

        await forgetCalendars(user.login).catch((e: unknown) => console.error('Clearing cached graphs failed', e));
        res.status(201).json({
            shareId,
            repoUrl: result.repo.htmlUrl,
            repoName: result.repo.name,
            commitCount: result.commitCount,
        });
    });

    router.get('/:shareId', async (req, res) => {
        await connectDb();
        const p = await PaintingModel.findOne({ shareId: req.params.shareId }).lean();
        if (!p) {
            res.status(404).json({ error: 'Painting not found' });
            return;
        }
        // Private repos 404 for everyone else anyway; the pattern itself is still shareable.
        res.json({
            shareId: p.shareId,
            login: p.login,
            text: p.text,
            ...(p.isPrivate ? {} : { repoUrl: p.repoUrl }),
            repoName: p.repoName,
            isPrivate: p.isPrivate,
            status: p.status,
            createdAt: p.createdAt,
            placement: p.placement,
            shade: p.shade,
            pattern: p.pattern,
            cells: p.cells,
        });
    });

    return router;
}

export const router = createPaintingsRouter();
