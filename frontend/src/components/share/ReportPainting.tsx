import { useState } from 'react';
import { useReportPainting } from '../../lib/share';

// A quiet link under the share page that opens a short form.
export function ReportPainting({ shareId }: { shareId: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const report = useReportPainting(shareId);

    if (report.isSuccess) {
        return (
            <p role="status" className="text-sm text-muted">
                Thanks. We'll take a look.
            </p>
        );
    }

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-muted hover:text-danger hover:underline">
                Report this painting
            </button>
        );
    }

    return (
        <form
            className="flex max-w-md flex-col gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                report.mutate(reason);
            }}
        >
            <label htmlFor="report-reason" className="text-sm font-semibold">
                What's wrong with it? <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                className="input"
            />
            <div className="flex gap-2">
                <button type="submit" disabled={report.isPending} className="btn btn-danger">
                    {report.isPending ? 'Sending…' : 'Send report'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn">
                    Cancel
                </button>
            </div>
            {report.error && (
                <p role="alert" className="text-sm text-danger">
                    Couldn't send the report. Try again in a moment.
                </p>
            )}
        </form>
    );
}
