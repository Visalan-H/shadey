import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        githubId: { type: Number, required: true, unique: true },
        login: { type: String, required: true },
        name: { type: String, default: null },
        avatarUrl: { type: String, default: '' },
        // AES-256-GCM encrypted GitHub token (services/crypto.ts). Load with .select('+tokenEnc').
        tokenEnc: { type: String, required: true, select: false },
        scopes: { type: [String], default: [] },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret: Record<string, unknown>) => {
                delete ret.tokenEnc;
                delete ret.__v;
                return ret;
            },
        },
    },
);

export type UserFields = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserFields>;

const createModel = () => mongoose.model('User', userSchema);
// Reuse the compiled model if this module is evaluated twice in one process (dev reloads, tests).
export const User = (mongoose.models.User as ReturnType<typeof createModel> | undefined) ?? createModel();
