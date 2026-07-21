"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAllFilesInUploads = deleteAllFilesInUploads;
exports.scheduleDailyUploadsCleanup = scheduleDailyUploadsCleanup;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const UPLOADS_DIR = path_1.default.resolve(__dirname, '../../uploads');
async function deleteAllFilesInUploads() {
    return new Promise((resolve, reject) => {
        fs_1.default.readdir(UPLOADS_DIR, (readErr, files) => {
            if (readErr) {
                // If uploads directory doesn't exist, nothing to delete
                if (readErr.code === 'ENOENT') {
                    return resolve();
                }
                return reject(readErr);
            }
            if (!files || files.length === 0) {
                return resolve();
            }
            let remaining = files.length;
            files.forEach((fileName) => {
                const filePath = path_1.default.join(UPLOADS_DIR, fileName);
                fs_1.default.stat(filePath, (statErr, stats) => {
                    if (statErr) {
                        if (--remaining === 0)
                            resolve();
                        return;
                    }
                    if (stats.isDirectory()) {
                        // Skip directories to avoid accidental recursive deletes
                        if (--remaining === 0)
                            resolve();
                        return;
                    }
                    fs_1.default.unlink(filePath, (unlinkErr) => {
                        if (unlinkErr) {
                            console.error('Failed to delete', filePath, unlinkErr);
                        }
                        if (--remaining === 0)
                            resolve();
                    });
                });
            });
        });
    });
}
function scheduleDailyUploadsCleanup() {
    // 24 hours in milliseconds
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    // First run will be scheduled after 24 hours; call once at startup separately
    setInterval(() => {
        deleteAllFilesInUploads()
            .then(() => console.log('[uploads-cleanup] Daily cleanup completed'))
            .catch((err) => console.error('[uploads-cleanup] Daily cleanup failed', err));
    }, TWENTY_FOUR_HOURS_MS);
}
