import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp({ serveClient: true });

app.listen(port, () => {
  console.log(`AI Accountant Assistant API running on http://localhost:${port}`);
});
