import { useState, type RefObject } from 'react';

interface Props {
    shareId: string;
    text?: string | null;
    // Overrides the first-person "I painted…" when sharing someone else's painting.
    message?: string;
    // Element to save as an image for "Download image"; the button is hidden without it.
    captureRef?: RefObject<HTMLElement | null>;
}

export function shareUrlFor(shareId: string) {
    return `${window.location.origin}/p/${encodeURIComponent(shareId)}`;
}

export function shareMessage(text?: string | null) {
    const clean = text?.trim();
    return clean ? `I painted "${clean}" on my GitHub contribution graph` : 'I painted my GitHub contribution graph';
}

// Each network's own share URL, so no SDKs or tracking scripts load on our page.
export function shareLinks(url: string, message: string) {
    const enc = encodeURIComponent;
    return {
        x: `https://x.com/intent/post?text=${enc(message)}&url=${enc(url)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
        whatsapp: `https://wa.me/?text=${enc(`${message} ${url}`)}`,
    };
}

const buttonClass =
    'inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800';

export function ShareButtons({ shareId, text, message, captureRef }: Props) {
    const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
    const [saving, setSaving] = useState<'busy' | 'failed' | null>(null);
    const url = shareUrlFor(shareId);
    const links = shareLinks(url, message ?? shareMessage(text));

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied('yes');
        } catch {
            setCopied('failed');
        }
    }

    async function download() {
        const node = captureRef?.current;
        if (!node) return;
        setSaving('busy');
        try {
            // Loaded on demand: only people who download pay for it.
            const { toPng } = await import('html-to-image');
            const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
            const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: dark ? '#0a0a0a' : '#ffffff' });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `graph-painting-${shareId}.png`;
            a.click();
            setSaving(null);
        } catch {
            setSaving('failed');
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copy} className={buttonClass}>
                    {copied === 'yes' ? 'Copied' : 'Copy link'}
                </button>
                <a href={links.x} target="_blank" rel="noreferrer" className={buttonClass}>
                    Share on X
                </a>
                <a href={links.linkedin} target="_blank" rel="noreferrer" className={buttonClass}>
                    LinkedIn
                </a>
                <a href={links.whatsapp} target="_blank" rel="noreferrer" className={buttonClass}>
                    WhatsApp
                </a>
                {captureRef && (
                    <button type="button" onClick={download} disabled={saving === 'busy'} className={buttonClass}>
                        {saving === 'busy' ? 'Saving…' : 'Download image'}
                    </button>
                )}
                <span aria-live="polite" className="sr-only">
                    {copied === 'yes' ? 'Share link copied' : ''}
                </span>
            </div>
            {copied === 'failed' && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Couldn't copy. Here's the link: <span className="select-all break-all font-mono">{url}</span>
                </p>
            )}
            {saving === 'failed' && <p className="text-sm text-red-600 dark:text-red-400">Couldn't save the image. Try a screenshot instead.</p>}
        </div>
    );
}
