import * as fs from 'fs';
import * as path from 'path';

function ensureDirectoryExists(directoryPath: string) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

export function cleanDirectory(directoryPath: string) {
  ensureDirectoryExists(directoryPath);
  fs.readdir(directoryPath, (err, files) => {
    if (err) throw err;

    for (const file of files) {
      if (file !== '.gitkeep') {
        fs.unlink(path.join(directoryPath, file), (err) => {
          if (err) throw err;
        });
      }
    }
  });
}
