const fs = require('fs');

const content = fs.readFileSync('./app/prediction/page.tsx', 'utf8');

// Find all component declarations
const compRegex = /const ([A-Za-z0-9_]+) = \([^)]*\) => \{/g;
let match;
while ((match = compRegex.exec(content)) !== null) {
  const name = match[1];
  const startIndex = match.index;
  // find matching closing brace (rough heuristic)
  let braceCount = 1;
  let i = content.indexOf('{', startIndex) + 1;
  while (braceCount > 0 && i < content.length) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    i++;
  }
  const compBody = content.substring(startIndex, i);
  
  if (compBody.includes('t("auto.') && !compBody.includes('const { t } = useTranslation()')) {
    console.log('Missing t in:', name);
  }
}
