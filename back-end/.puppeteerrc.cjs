const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to a directory inside the project folder.
  // This is required on Render.com because the default /opt/render/.cache directory 
  // is not persisted to the runtime environment, whereas the project folder is.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
