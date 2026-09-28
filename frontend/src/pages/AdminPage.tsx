import { Link } from 'react-router';
import { sharePath } from '../components/design/PaintDone';
import { useAdminAction, useReports, type ReportedPainting } from '../lib/admin';
import { useMe } from '../lib/auth';

// Reported share pages, for the accounts in the backend's ADMIN_GITHUB_IDS.
export function AdminPage() {
    const { data: me, isPending } = useMe();
    const reports = useReports(Boolean(me?.admin));

    if (isPending) return null;
    if (!me?.admin) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-8">
                <p className="text-lg">This page doesn't exist.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
            <h1 className="text-xl font-semibold">Reports</h1>
            {reports.isPending ? (
                <p className="text-muted">Loading…</p>
            ) : reports.error ? (
                <p role="alert" className="text-danger">
                    Couldn't load reports. Try again in a moment.
                </p>
            ) : reports.data.length === 0 ? (
                <p className="text-muted">Nothing reported.</p>
            ) : (
                <ul className="box divide-y divide-line">
                    {reports.data.map((r) => (
                        <ReportRow key={r.shareId} report={r} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function ReportRow({ report: r }: { report: ReportedPainting }) {
    const action = useAdminAction();
    const busy = action.isPending;
    const when = new Date(r.lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
        <li className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link to={sharePath(r.shareId)} className="link font-semibold break-all">
                    @{r.login}
                    {r.text ? ` "${r.text}"` : ''}
                </Link>
                <span className="text-sm text-muted">
                    {r.count} report{r.count === 1 ? '' : 's'} · last {when}
                    {r.status === 'hidden' ? ' · taken down' : r.status === 'deleted' ? ' · deleted by owner' : ''}
                </span>
            </div>
            {r.reasons.length > 0 && (
                <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
                    {r.reasons.map((reason, i) => (
                        <li key={i} className="break-words">
                            {reason}
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap gap-2">
                {r.status === 'painted' && (
                    <button type="button" disabled={busy} onClick={() => action.mutate({ shareId: r.shareId, action: 'hide' })} className="btn btn-danger">
                        Take down
                    </button>
                )}
                {r.status === 'hidden' && (
                    <button type="button" disabled={busy} onClick={() => action.mutate({ shareId: r.shareId, action: 'restore' })} className="btn">
                        Put back
                    </button>
                )}
                <button type="button" disabled={busy} onClick={() => action.mutate({ shareId: r.shareId, action: 'dismiss' })} className="btn">
                    Dismiss reports
                </button>
            </div>
            {action.error && <p className="text-sm text-danger">{action.error.message}</p>}
        </li>
    );
}
