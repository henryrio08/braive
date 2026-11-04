import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Tests use a private temporary root; production keeps the existing data/ledger.
// This changes asset/world storage only, never resets or relocates approval.
export const dataDirectory=process.env.BRAIVE_DATA_DIR?resolve(process.env.BRAIVE_DATA_DIR):fileURLToPath(new URL('../data/',import.meta.url));
