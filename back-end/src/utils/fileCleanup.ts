import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

export async function deleteAllFilesInUploads(): Promise<void> {
	return new Promise((resolve, reject) => {
		fs.readdir(UPLOADS_DIR, (readErr, files) => {
			if (readErr) {
				// If uploads directory doesn't exist, nothing to delete
				if ((readErr as NodeJS.ErrnoException).code === 'ENOENT') {
					return resolve();
				}
				return reject(readErr);
			}

			if (!files || files.length === 0) {
				return resolve();
			}

			let remaining = files.length;
			files.forEach((fileName) => {
				const filePath = path.join(UPLOADS_DIR, fileName);
				fs.stat(filePath, (statErr, stats) => {
					if (statErr) {
						if (--remaining === 0) resolve();
						return;
					}
					if (stats.isDirectory()) {
						// Skip directories to avoid accidental recursive deletes
						if (--remaining === 0) resolve();
						return;
					}
					fs.unlink(filePath, (unlinkErr) => {
						if (unlinkErr) {
							console.error('Failed to delete', filePath, unlinkErr);
						}
						if (--remaining === 0) resolve();
					});
				});
			});
		});
	});
}

export function scheduleDailyUploadsCleanup(): void {
	// 24 hours in milliseconds
	const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

	// First run will be scheduled after 24 hours; call once at startup separately
	setInterval(() => {
		deleteAllFilesInUploads()
			.then(() => console.log('[uploads-cleanup] Daily cleanup completed'))
			.catch((err) => console.error('[uploads-cleanup] Daily cleanup failed', err));
	}, TWENTY_FOUR_HOURS_MS);
}


