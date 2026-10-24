import 'dotenv/config';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const { app } = buildServer({ config });

app.listen({ host: config.host, port: config.port }).catch((err) => {
  console.error(err);
  process.exit(1);
});
