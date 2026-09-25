// Local dev only: the frontend's Vite server proxies /api, /p and /og here.
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => console.log(`api on http://localhost:${port}`));
