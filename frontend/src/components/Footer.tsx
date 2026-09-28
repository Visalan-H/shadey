import { Link } from 'react-router';

export function Footer() {
    return (
        <footer className="border-t border-line">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-6 text-sm text-muted">
                <p>Shadey isn't affiliated with or endorsed by GitHub.</p>
                <Link to="/privacy" className="hover:text-accent hover:underline">
                    Privacy
                </Link>
            </div>
        </footer>
    );
}
