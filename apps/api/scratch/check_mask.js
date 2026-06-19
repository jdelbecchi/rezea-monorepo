const fs = require('fs');
const content = fs.readFileSync('apps/web/src/app/[slug]/home/page.tsx', 'utf8');
console.log('Includes mask:', content.includes('mask'));
console.log('Includes gradient:', content.includes('gradient'));
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('mask') || line.includes('gradient')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
});
