import fs from 'fs';
import path from 'path';

function lowerCaseDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const lowerFullPath = path.join(dir, file.toLowerCase());
    if (fullPath !== lowerFullPath) {
      fs.renameSync(fullPath, lowerFullPath);
    }
    if (fs.statSync(lowerFullPath).isDirectory()) {
      lowerCaseDir(lowerFullPath);
    }
  }
}

lowerCaseDir('./src/components');
console.log('Normalized case for src/components');
