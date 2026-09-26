// Written into the painted repo, so anyone who stumbles on it knows what it is and how to undo it.
export function paintReadme(opts: { login: string; text?: string; appUrl: string; shareUrl: string }): string {
    const { login, text, appUrl, shareUrl } = opts;
    const what = text?.trim() ? `"${text.trim().replace(/\s+/g, ' ')}"` : 'a drawing';
    return [
        '# Contribution graph painting',
        '',
        `This repository paints ${what} on @${login}'s GitHub contribution graph.`,
        `It was made with [Graph Painter](${appUrl}).`,
        '',
        '## How it works',
        '',
        'The commits here are empty and backdated. Each one lands on a chosen day,',
        'so together they draw the pattern on the contribution graph. No code lives here.',
        '',
        '## Removing it',
        '',
        'Delete this repository and the painting disappears from the graph:',
        '',
        '- On GitHub: Settings, then Danger Zone, then "Delete this repository".',
        `- Or from [Graph Painter](${appUrl}), which can delete it for you.`,
        '',
        '## See it',
        '',
        `Share page: ${shareUrl}`,
        '',
    ].join('\n');
}
