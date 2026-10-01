import path from "node:path";
import { BackupError, createBackup } from "../src/lib/data-backup";

const projectRoot = process.cwd();
try {
  const created = createBackup({ projectRoot });
  console.log(path.relative(projectRoot, created.directory));
  console.log(`파일 ${created.manifest.files.length}개`);
} catch (error) {
  const message = error instanceof BackupError ? error.message : "백업을 만들지 못했습니다.";
  console.error(message);
  process.exitCode = 1;
}
