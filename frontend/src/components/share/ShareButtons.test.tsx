import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareButtons, shareLinks, shareMessage } from './ShareButtons';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('shareLinks', () => {
    it('builds each network share URL with the page URL encoded', () => {
        const links = shareLinks('https://paint.test/p/abc', 'I painted "HI"');
        expect(links.x).toBe('https://x.com/intent/post?text=I%20painted%20%22HI%22&url=https%3A%2F%2Fpaint.test%2Fp%2Fabc');
        expect(links.linkedin).toBe('https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fpaint.test%2Fp%2Fabc');
        expect(links.whatsapp).toBe('https://wa.me/?text=I%20painted%20%22HI%22%20https%3A%2F%2Fpaint.test%2Fp%2Fabc');
    });

    it('words the message with or without text', () => {
        expect(shareMessage(' HI ')).toBe('I painted "HI" on my GitHub contribution graph');
        expect(shareMessage('')).toBe('I painted my GitHub contribution graph');
    });
});

describe('ShareButtons', () => {
    it('copies the share link', async () => {
        const user = userEvent.setup();
        const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
        render(<ShareButtons shareId="abc" />);
        await user.click(screen.getByRole('button', { name: 'Copy link' }));
        expect(write).toHaveBeenCalledWith(`${window.location.origin}/p/abc`);
        expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('shows the link when copying fails', async () => {
        const user = userEvent.setup();
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
        render(<ShareButtons shareId="abc" />);
        await user.click(screen.getByRole('button', { name: 'Copy link' }));
        expect(screen.getByText(`${window.location.origin}/p/abc`)).toBeInTheDocument();
    });

    it('offers a download only when there is something to capture', () => {
        const { rerender } = render(<ShareButtons shareId="abc" />);
        expect(screen.queryByRole('button', { name: 'Download image' })).not.toBeInTheDocument();
        rerender(<ShareButtons shareId="abc" captureRef={{ current: document.body }} />);
        expect(screen.getByRole('button', { name: 'Download image' })).toBeInTheDocument();
    });
});
