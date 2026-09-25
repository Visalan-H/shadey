import { describe, expect, it } from 'vitest';
import { paintReadme } from './readme.js';

const base = { login: 'octocat', appUrl: 'https://paint.test', shareUrl: 'https://paint.test/s/abc123' };

describe('paintReadme', () => {
    it('explains the repo, how it works and how to remove it', () => {
        const md = paintReadme({ ...base, text: '  Hire\nme ' });
        expect(md).toContain('"Hire me"');
        expect(md).toContain("@octocat's GitHub contribution graph");
        expect(md).toContain('[Graph Painter](https://paint.test)');
        expect(md).toMatch(/empty and backdated/);
        expect(md).toMatch(/Delete this repository/);
        expect(md).toMatch(/Danger Zone/);
        expect(md).toContain('https://paint.test/s/abc123');
        expect(md.endsWith('\n')).toBe(true);
    });

    it('describes pixel drawings without text', () => {
        expect(paintReadme(base)).toContain('paints a drawing on');
        expect(paintReadme({ ...base, text: '   ' })).toContain('paints a drawing on');
    });
});
