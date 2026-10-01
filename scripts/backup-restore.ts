import path from "node:path";
import { BackupError, restoreBackup } from "../src/lib/data-backup";

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

const backup = readArg("--backup");
const target = readArg("--target");
if (!backup || !target) {
  console.error("사용법: npm run backup:restore -- --backup backups/costume-data-날짜-시각 --target 비어있는폴더");
  process.exitCode = 1;
} else {
  try {
    const manifest = restoreBackup({
      backupDir: path.resolve(backup),
      targetDir: path.resolve(target),
      projectRoot: process.cwd(),
    });
    console.log(`복원됨 ${manifest.files.length}개`);
    console.log(path.resolve(target));
  } catch (error) {
    const message = error instanceof BackupError ? error.message : "복원하지 못했습니다.";
    console.error(message);
    process.exitCode = 1;
  }
}
