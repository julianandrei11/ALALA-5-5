const fs = require('fs');
const path = require('path');


function containsEmoji(text) {
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0F5}]|[\u{1F200}-\u{1F2FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;
  return emojiRegex.test(text);
}


function removeEmojis(text) {
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0F5}]|[\u{1F200}-\u{1F2FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]/gu;
  return text.replace(emojiRegex, '');
}


function removeComments(content, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.js':
    case '.ts':
    case '.jsx':
    case '.tsx':
      return removeJSComments(content);
    case '.html':
    case '.htm':
      return removeHTMLComments(content);
    case '.css':
    case '.scss':
    case '.sass':
      return removeCSSComments(content);
    case '.json':
      return content; 
    case '.md':
      return removeMarkdownComments(content);
    case '.xml':
      return removeXMLComments(content);
    case '.php':
      return removePHPComments(content);
    case '.blade':
      return removeBladeComments(content);
    default:
      return removeGenericComments(content);
  }
}


function removeJSComments(content) {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  
  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (!inString) {
      
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      }
      
      
      if (char === '/' && nextChar === '/') {
        
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        continue;
      }
      
      
      if (char === '/' && nextChar === '*') {
        
        i += 2;
        while (i < content.length - 1) {
          if (content[i] === '*' && content[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
    } else {
      
      if (char === stringChar) {
        
        if (content[i - 1] === '\\') {
          result += char;
          i++;
          continue;
        }
        inString = false;
        stringChar = '';
      }
    }
    
    result += char;
    i++;
  }
  
  return result;
}

function removeHTMLComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

function removeCSSComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '');
}

function removeMarkdownComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

function removeXMLComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

function removePHPComments(content) {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  
  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      }
      
      if (char === '/' && nextChar === '/') {
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        continue;
      }
      
      if (char === '/' && nextChar === '*') {
        i += 2;
        while (i < content.length - 1) {
          if (content[i] === '*' && content[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
      
      if (char === '#') {
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        continue;
      }
    } else {
      if (char === stringChar) {
        if (content[i - 1] === '\\') {
          result += char;
          i++;
          continue;
        }
        inString = false;
        stringChar = '';
      }
    }
    
    result += char;
    i++;
  }
  
  return result;
}

function removeBladeComments(content) {
  let result = content.replace(/\{\{--[\s\S]*?--\}\}/g, '');
  result = result.replace(/<!--[\s\S]*?-->/g, '');
  return result;
}

function removeGenericComments(content) {
  let result = content;
  result = result.replace(/\/\/.*$/gm, '');
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/#.*$/gm, '');
  result = result.replace(/<!--[\s\S]*?-->/g, '');
  return result;
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    
    if (containsEmoji(content)) {
      newContent = removeEmojis(newContent);
    }
    
    newContent = removeComments(newContent, filePath);
    
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Processed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function processDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);
  let processedCount = 0;
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.angular'].includes(item)) {
        processedCount += processDirectory(fullPath);
      }
    } else if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      if (['.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css', '.scss', '.sass', '.json', '.md', '.xml', '.php', '.blade'].includes(ext)) {
        if (processFile(fullPath)) {
          processedCount++;
        }
      }
    }
  }
  
  return processedCount;
}

const projectRoot = process.cwd();
console.log(`Starting cleanup of project: ${projectRoot}`);

const processedCount = processDirectory(projectRoot);
console.log(`\nCleanup complete! Processed ${processedCount} files.`);

fs.unlinkSync(__filename);
console.log('Cleanup script removed.');
