import { execFileSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.rules.json'], {
  stdio: 'inherit',
});
await copyFile('output/compiled-rules/rules.js', 'bomberman-clone/src/game/rules.js');
