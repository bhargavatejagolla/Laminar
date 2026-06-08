const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = walk('./app').concat(walk('./components'));
let foundBad = false;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('t("auto.')) return;

  const compRegex = /(?:const|function)\s+([A-Za-z0-9_]+)\s*=?\s*\([^)]*\)\s*(?:=>)?\s*\{/g;
  let match;
  while ((match = compRegex.exec(content)) !== null) {
    const name = match[1];
    const startIndex = match.index;
    let braceCount = 1;
    let i = content.indexOf('{', startIndex) + 1;
    while (braceCount > 0 && i < content.length) {
      if (content[i] === '{') braceCount++;
      if (content[i] === '}') braceCount--;
      i++;
    }
    const compBody = content.substring(startIndex, i);
    
    // Check if body uses t("auto.)
    if (compBody.includes('t("auto.') && !compBody.includes('const { t } = useTranslation()')) {
      console.log('Missing t in:', file, '->', name);
      foundBad = true;
    }
  }
});
if (!foundBad) console.log('All clear!');
