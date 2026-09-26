import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { signInUrl, useMe, useSignOut, type Me } from '../lib/auth';

export function AuthButton() {
    const { data: me, isPending } = useMe();
    const location = useLocation();

    // Render nothing until we know, so the header doesn't flash "Sign in" for signed-in users.
    if (isPending) return <div className="h-9 w-9" aria-hidden="true" />;
    if (!me) {
        return (
            <a
                href={signInUrl(location.pathname + location.search)}
                className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
                <GitHubMark />
                Sign in with GitHub
            </a>
        );
    }
    return <AccountMenu me={me} />;
}

function AccountMenu({ me }: { me: Me }) {
    const [open, setOpen] = useState(false);
    const signOut = useSignOut();
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

    useEffect(() => {
        if (!open) return;
        items()[0]?.focus();
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    function close() {
        setOpen(false);
        buttonRef.current?.focus();
    }

    function onMenuKeyDown(e: KeyboardEvent) {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        const focus = (n: number) => list[(n + list.length) % list.length]?.focus();
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowDown') focus(i + 1);
        else if (e.key === 'ArrowUp') focus(i - 1);
        else if (e.key === 'Home') focus(0);
        else if (e.key === 'End') focus(list.length - 1);
        else if (e.key === 'Tab') setOpen(false);
        else return;
        if (e.key !== 'Tab') e.preventDefault();
    }

    const itemClass =
        'block w-full px-4 py-3 text-left text-sm hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none sm:py-2 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800';

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label={`Account menu for ${me.login}`}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && !open) {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-green-600 dark:hover:bg-neutral-800"
            >
                <img src={me.avatarUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
                <span className="max-w-[10rem] truncate text-sm font-medium">{me.login}</span>
            </button>
            {open && (
                <div
                    ref={menuRef}
                    id={menuId}
                    role="menu"
                    aria-label="Account"
                    onKeyDown={onMenuKeyDown}
                    className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                >
                    <Link to="/me" role="menuitem" tabIndex={-1} className={itemClass} onClick={() => setOpen(false)}>
                        My paintings
                    </Link>
                    <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        className={itemClass}
                        disabled={signOut.isPending}
                        onClick={() => signOut.mutate(undefined, { onSettled: () => setOpen(false) })}
                    >
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}

function GitHubMark() {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}
