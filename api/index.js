// Vercel runs this file as the API. The same Express app serves every /api route.
import { createApp } from '../server/src/app.js';

export default createApp();
