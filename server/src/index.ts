import 'dotenv/config';
import { loadConfig, type Config } from './config.js';
import { createHub } from './hub.js';

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const { server } = await createHub(config);
server.listen(config.port, config.host, () => {
  console.log(`AgentHub listening on http://${config.host}:${config.port}`);
});
