import path from "node:path";
import { BackupError, verifyBackup } from "../src/lib/data-backup";

const backup = process.argv[2];
if (!backup) {
  console.error("사용법: npm run backup:verify -- backups/costume-data-날짜-시각");
  process.exitCode = 1;
} else {
  try {
    const manifest = verifyBackup(path.resolve(backup));
    console.log(`확인됨 ${manifest.createdAt}`);
    console.log(`파일 ${manifest.files.length}개`);
  } catch (error) {
    const message = error instanceof BackupError ? error.message : "백업을 확인하지 못했습니다.";
    console.error(message);
    process.exitCode = 1;
  }
}
