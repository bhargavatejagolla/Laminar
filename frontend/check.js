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
      if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}

const files = walk('./app').concat(walk('./components'));
const badFiles = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('t("auto.')) {
    // Some components might define t inside the component function, 
    // but we can just check if useTranslation is in the file.
    if (!content.includes('useTranslation')) {
      badFiles.push(file);
    } else {
      // Let's also check if there is any component that uses t("auto.) but DOES NOT define t in its scope.
      // This is harder to check statically, but we can look for "t is not defined" errors.
    }
  }
});

console.log('Bad files:', badFiles);
