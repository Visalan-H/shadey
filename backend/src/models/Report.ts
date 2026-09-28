import mongoose, { Schema } from 'mongoose';

// One visitor's report about one shared painting. Reporting again replaces the reason.
export interface Report {
    shareId: string;
    // Signed-in user id, or a salted hash of the IP, so repeat reports count once.
    reporterKey: string;
    reason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const reportSchema = new Schema<Report>(
    {
        shareId: { type: String, required: true, index: true },
        reporterKey: { type: String, required: true },
        reason: { type: String, maxlength: 500 },
    },
    { timestamps: true },
);
reportSchema.index({ shareId: 1, reporterKey: 1 }, { unique: true });

export const ReportModel =
    (mongoose.models.Report as mongoose.Model<Report> | undefined) ?? mongoose.model<Report>('Report', reportSchema);
