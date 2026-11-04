import { app } from './app';
import { initDatabase } from './db/database';

const PORT = parseInt(process.env.PORT || '4000', 10);

initDatabase();

app.listen(PORT, () => {
  console.log(`[SHIPREWARD Server] Running on http://localhost:${PORT}`);
  console.log(`[SHIPREWARD Server] Health check available at http://localhost:${PORT}/api/health`);
  console.log(`[SHIPREWARD Server] GitHub Webhook listening at http://localhost:${PORT}/api/webhooks/github`);
});
