import { Link } from 'react-router';
import { AuthButton } from './AuthButton';

export function Header() {
    return (
        <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <Link to="/" className="font-semibold">
                Graph Painter
            </Link>
            <AuthButton />
        </header>
    );
}
