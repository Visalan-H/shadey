// Test helper: a local git smart-HTTP server (git http-backend behind node http),
// so pushes can be tested end to end without reaching github.com.
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface GitRequest {
    method: string;
    url: string;
    authorization: string | undefined;
}

export interface GitServer {
    baseUrl: string;
    root: string;
    requests: GitRequest[];
    // Creates an empty bare repo that accepts pushes; returns its path on disk.
    createRepo(name: string): Promise<string>;
    repoUrl(name: string): string;
    // Runs the git CLI against a bare repo created with createRepo.
    git(name: string, ...args: string[]): Promise<string>;
    close(): Promise<void>;
}

export async function startGitServer(opts: { token?: string } = {}): Promise<GitServer> {
    const root = await mkdtemp(path.join(tmpdir(), 'git-server-'));
    const requests: GitRequest[] = [];
    const expectedAuth = opts.token
        ? 'Basic ' + Buffer.from(`x-access-token:${opts.token}`).toString('base64')
        : undefined;

    const server = http.createServer((req, res) => {
        requests.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization });
        // Like GitHub: challenge first, the client only sends credentials after a 401.
        if (expectedAuth && req.headers.authorization !== expectedAuth) {
            res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' }).end();
            return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            const url = new URL(req.url ?? '/', 'http://localhost');
            const env: NodeJS.ProcessEnv = {
                PATH: process.env.PATH,
                GIT_PROJECT_ROOT: root,
                GIT_HTTP_EXPORT_ALL: '1',
                REMOTE_USER: 'test',
                REQUEST_METHOD: req.method,
                PATH_INFO: decodeURIComponent(url.pathname),
                QUERY_STRING: url.search.slice(1),
                CONTENT_TYPE: req.headers['content-type'] ?? '',
                // Buffered so http-backend always gets an exact length, even for chunked uploads.
                CONTENT_LENGTH: String(body.length),
            };
            for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === 'string') env['HTTP_' + key.toUpperCase().replace(/-/g, '_')] = value;
            }
            const cgi = spawn('git', ['http-backend'], { env });
            const out: Buffer[] = [];
            cgi.stdout.on('data', (c: Buffer) => out.push(c));
            cgi.stderr.resume();
            cgi.on('close', () => {
                const raw = Buffer.concat(out);
                let split = raw.indexOf('\r\n\r\n');
                let sepLen = 4;
                if (split < 0) {
                    split = raw.indexOf('\n\n');
                    sepLen = 2;
                }
                if (split < 0) {
                    res.writeHead(500).end();
                    return;
                }
                let status = 200;
                const headers: Record<string, string> = {};
                for (const line of raw.subarray(0, split).toString().split(/\r?\n/)) {
                    const i = line.indexOf(':');
                    if (i < 0) continue;
                    const name = line.slice(0, i).trim();
                    const value = line.slice(i + 1).trim();
                    if (name.toLowerCase() === 'status') status = parseInt(value, 10);
                    else headers[name] = value;
                }
                res.writeHead(status, headers).end(raw.subarray(split + sepLen));
            });
            cgi.stdin.end(body);
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const repoPath = (name: string) => path.join(root, name.endsWith('.git') ? name : `${name}.git`);

    return {
        baseUrl,
        root,
        requests,
        async createRepo(name) {
            const dir = repoPath(name);
            await run('git', ['init', '--quiet', '--bare', '--initial-branch=main', dir]);
            await run('git', ['-C', dir, 'config', 'http.receivepack', 'true']);
            return dir;
        },
        repoUrl: (name) => `${baseUrl}/${name.endsWith('.git') ? name : `${name}.git`}`,
        async git(name, ...args) {
            const { stdout } = await run('git', ['-C', repoPath(name), ...args], { maxBuffer: 64 * 1024 * 1024 });
            return stdout;
        },
        async close() {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await rm(root, { recursive: true, force: true });
        },
    };
}
