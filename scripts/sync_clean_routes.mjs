import fs from 'fs';
import path from 'path';

const BASE_DIR = 'C:/Users/Mars/TWmeme/web';

function syncToDirectory(filePath, destDir) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.writeFileSync(path.join(destDir, 'index.html'), content, 'utf-8');
  console.log(`Synced: ${filePath} -> ${path.join(destDir, 'index.html')}`);
}

// 1. Sponsor
syncToDirectory(path.join(BASE_DIR, 'sponsor.html'), path.join(BASE_DIR, 'sponsor'));

// 2. Legal pages
syncToDirectory(path.join(BASE_DIR, 'legal/privacy.html'), path.join(BASE_DIR, 'legal/privacy'));
syncToDirectory(path.join(BASE_DIR, 'legal/terms.html'), path.join(BASE_DIR, 'legal/terms'));
syncToDirectory(path.join(BASE_DIR, 'legal/dmca.html'), path.join(BASE_DIR, 'legal/dmca'));

// 3. Guide pages
const guideDir = path.join(BASE_DIR, 'guide');
const guideFiles = fs.readdirSync(guideDir).filter(f => f.endsWith('.html') && f !== 'index.html');
for (const f of guideFiles) {
  const slug = f.replace('.html', '');
  syncToDirectory(path.join(guideDir, f), path.join(guideDir, slug));
}

console.log('All static directories synced successfully!');
