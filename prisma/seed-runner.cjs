const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const compiledSeed = path.join(rootDir, 'dist', 'prisma', 'seed.js');
const sourceSeed = path.join(rootDir, 'prisma', 'seed.ts');
const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const canRunCompiled = fs.existsSync(compiledSeed);
const canRunSource = fs.existsSync(tsxCli) && fs.existsSync(sourceSeed);
const preferCompiled = process.env.NODE_ENV === 'production';

let args;
if (preferCompiled && canRunCompiled) {
  args = [compiledSeed];
} else if (canRunSource) {
  args = [tsxCli, sourceSeed];
} else if (canRunCompiled) {
  args = [compiledSeed];
} else {
  console.error(
    'No runnable Prisma seed found. Run npm install for local tsx support or npm run build to create dist/prisma/seed.js.',
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, args, {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
