import mongoose, { Schema } from 'mongoose';
import type { Calendar } from '../types.js';

export const CACHE_TTL_SECONDS = 60 * 60;

export interface CalendarCacheDoc {
    key: string; // lowercase login + ':' + year or 'rolling'
    calendar: Calendar;
    createdAt: Date;
}

const schema = new Schema<CalendarCacheDoc>({
    key: { type: String, required: true, unique: true },
    calendar: { type: Schema.Types.Mixed, required: true },
    // Mongo's TTL monitor only sweeps about once a minute, so readers also check freshness.
    createdAt: { type: Date, required: true, default: Date.now, expires: CACHE_TTL_SECONDS },
});

export const CalendarCache =
    (mongoose.models.CalendarCache as mongoose.Model<CalendarCacheDoc> | undefined) ??
    mongoose.model<CalendarCacheDoc>('CalendarCache', schema);
