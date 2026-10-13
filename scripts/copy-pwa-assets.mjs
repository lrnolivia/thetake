import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/assets/icons', { recursive: true });
await cp('assets/icons', 'dist/assets/icons', { recursive: true });
