import { Link } from 'react-router';
import { AuthButton } from './AuthButton';

export function Header() {
    return (
        <header className="border-b border-line bg-header">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
                <Link to="/" className="font-semibold">
                    Shadey
                </Link>
                <AuthButton />
            </div>
        </header>
    );
}
