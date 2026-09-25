// Small fetch wrapper for our own API (same origin; cookies included).
export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText);
    return body as T;
}
