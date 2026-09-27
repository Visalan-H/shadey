import { Link } from 'react-router';
import { AuthButton } from './AuthButton';

export function Header() {
    return (
        <header className="border-b border-line bg-header">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
                <Link to="/" className="flex items-center gap-2.5 font-semibold">
                    <span aria-hidden="true" className="grid grid-cols-2 gap-[2px]">
                        <i className="h-2 w-2 rounded-[2px] bg-lvl-2" />
                        <i className="h-2 w-2 rounded-[2px] bg-lvl-4" />
                        <i className="h-2 w-2 rounded-[2px] bg-lvl-4" />
                        <i className="h-2 w-2 rounded-[2px] bg-lvl-1" />
                    </span>
                    Graph Painter
                </Link>
                <AuthButton />
            </div>
        </header>
    );
}
