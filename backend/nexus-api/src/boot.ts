// Imported by server.ts right after dotenv: refuses to boot a production process with unsafe config.
import { validateConfigOrExit } from './lib/config';
validateConfigOrExit();
