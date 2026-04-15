import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const hostingDir = path.join(rootDir, 'hosting');
const exists = (target) => fs.existsSync(target);

if (!exists(distDir)) {
  console.error('Missing dist/. Run `npm run build` first.');
  process.exit(1);
}

const resetHostingRoot = () => {
  fs.rmSync(hostingDir, { recursive: true, force: true });
  fs.mkdirSync(hostingDir, { recursive: true });
};

const copyRootDist = () => {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(distDir, entry.name);
    const target = path.join(hostingDir, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(source, target, { recursive: true });
    } else {
      fs.copyFileSync(source, target);
    }
  }
};

resetHostingRoot();
copyRootDist();

console.log('Prepared hosting root from dist/.');
