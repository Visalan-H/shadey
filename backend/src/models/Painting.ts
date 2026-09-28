import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';
import { nanoid } from 'nanoid';
import type { Level, Pattern } from '../types.js';

// hidden = taken down after a report; the repo and the owner's list are unaffected.
export type PaintingStatus = 'painted' | 'deleted' | 'hidden';

export interface Placement {
    // rolling = the last 53 weeks ending today; year = a calendar year's graph.
    mode: 'rolling' | 'year';
    year?: number;
    // Week-column where the pattern starts.
    offset: number;
}

// One painted day: enough to redraw the painting (e.g. for share images) without calling GitHub.
export interface PaintedCell {
    date: string; // YYYY-MM-DD
    level: Exclude<Level, 0>;
    count: number;
}

export interface Painting {
    shareId: string;
    userId: Types.ObjectId;
    login: string;
    repoOwner: string;
    repoName: string;
    repoUrl: string;
    isPrivate: boolean;
    text?: string;
    pattern: Pattern;
    placement: Placement;
    shade: Exclude<Level, 0>;
    perCell: number;
    totalCommits: number;
    cells: PaintedCell[];
    // Times extra commits were pushed because GitHub showed some days too light.
    topUps: number;
    status: PaintingStatus;
    createdAt: Date;
    updatedAt: Date;
}

export type PaintingDoc = HydratedDocument<Painting>;

const placementSchema = new Schema<Placement>(
    {
        mode: { type: String, enum: ['rolling', 'year'], required: true },
        year: {
            type: Number,
            min: 1970,
            required(this: Placement) {
                return this.mode === 'year';
            },
        },
        offset: { type: Number, required: true, min: 0 },
    },
    { _id: false },
);

const cellSchema = new Schema<PaintedCell>(
    {
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        level: { type: Number, required: true, min: 1, max: 4 },
        count: { type: Number, required: true, min: 1 },
    },
    { _id: false },
);

const paintingSchema = new Schema<Painting>(
    {
        shareId: { type: String, required: true, unique: true, default: () => nanoid(10) },
        userId: { type: Schema.Types.ObjectId, required: true, index: true },
        login: { type: String, required: true },
        repoOwner: { type: String, required: true },
        repoName: { type: String, required: true },
        repoUrl: { type: String, required: true },
        isPrivate: { type: Boolean, required: true },
        text: { type: String, maxlength: 200 },
        pattern: {
            type: [[Boolean]],
            required: true,
            validate: {
                validator: (p: Pattern) => p.length === 7,
                message: 'Pattern must have 7 rows',
            },
        },
        placement: { type: placementSchema, required: true },
        shade: { type: Number, required: true, min: 1, max: 4 },
        perCell: { type: Number, required: true, min: 1, max: 500 },
        totalCommits: { type: Number, required: true, min: 1 },
        cells: { type: [cellSchema], required: true },
        topUps: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['painted', 'deleted', 'hidden'], default: 'painted', required: true },
    },
    { timestamps: true },
);

// Reused across hot reloads and test files that import the model more than once.
export const PaintingModel =
    (mongoose.models.Painting as mongoose.Model<Painting> | undefined) ?? mongoose.model<Painting>('Painting', paintingSchema);
