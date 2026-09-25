import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../test/mongo.js';
import { PaintingModel, type Painting } from './Painting.js';

useTestDb();

beforeAll(async () => {
    await PaintingModel.init();
});

function valid(): Partial<Painting> {
    return {
        userId: new mongoose.Types.ObjectId(),
        login: 'octocat',
        repoOwner: 'octocat',
        repoName: 'paint-hi',
        repoUrl: 'https://github.com/octocat/paint-hi',
        isPrivate: false,
        text: 'Hi',
        pattern: Array.from({ length: 7 }, (_, r) => [r % 2 === 0, true]),
        placement: { mode: 'year', year: 2025, offset: 3 },
        shade: 4,
        perCell: 20,
        totalCommits: 40,
        cells: [
            { date: '2025-01-19', level: 4, count: 20 },
            { date: '2025-01-20', level: 4, count: 20 },
        ],
    };
}

describe('Painting', () => {
    it('saves with defaults', async () => {
        const doc = await PaintingModel.create(valid());
        expect(doc.shareId).toMatch(/^[\w-]{10}$/);
        expect(doc.status).toBe('painted');
        expect(doc.createdAt).toBeInstanceOf(Date);

        const found = await PaintingModel.findOne({ shareId: doc.shareId }).lean();
        expect(found?.pattern).toEqual(valid().pattern);
        expect(found?.placement).toEqual({ mode: 'year', year: 2025, offset: 3 });
        expect(found?.cells).toHaveLength(2);
    });

    it('allows rolling placement without a year and no text', async () => {
        const data = { ...valid(), placement: { mode: 'rolling' as const, offset: 0 } };
        delete data.text;
        await expect(PaintingModel.create(data)).resolves.toBeTruthy();
    });

    it('enforces a unique shareId', async () => {
        await PaintingModel.create({ ...valid(), shareId: 'same123456' });
        await expect(PaintingModel.create({ ...valid(), shareId: 'same123456' })).rejects.toMatchObject({
            code: 11000,
        });
    });

    it.each<[string, Partial<Painting>]>([
        ['a shade out of range', { shade: 5 as Painting['shade'] }],
        ['a pattern without 7 rows', { pattern: [[true]] }],
        ['an unknown status', { status: 'gone' as Painting['status'] }],
        ['a year placement without a year', { placement: { mode: 'year', offset: 0 } }],
        ['a bad cell date', { cells: [{ date: 'yesterday', level: 1, count: 1 }] }],
    ])('rejects %s', async (_label, patch) => {
        await expect(PaintingModel.create({ ...valid(), ...patch })).rejects.toBeInstanceOf(
            mongoose.Error.ValidationError,
        );
    });

    it('requires the repo fields', async () => {
        const data = valid();
        delete data.repoName;
        await expect(PaintingModel.create(data)).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
    });
});
