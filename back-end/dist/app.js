"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const stripeRoutes_1 = __importDefault(require("./routes/stripeRoutes"));
const fileCleanup_1 = require("./utils/fileCleanup");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '7000', 10);
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use((0, cors_1.default)({ origin: ['https://mynext9to5.com', 'https://www.mynext9to5.com', 'http://localhost:5173', 'http://localhost:3001'] }));
// Raw body parser for Stripe webhooks (MUST come before express.json)
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json({ limit: '5mb' }));
app.use(express_1.default.urlencoded({ limit: '5mb', extended: true }));
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/api', fileRoutes_1.default);
app.use('/api', stripeRoutes_1.default);
app.use(fileRoutes_1.default);
app.use(stripeRoutes_1.default);
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
});
// Initialize database and start server
const startServer = async () => {
    try {
        // Cleanup uploads immediately on server start
        (0, fileCleanup_1.deleteAllFilesInUploads)()
            .then(() => console.log('[uploads-cleanup] Startup cleanup completed'))
            .catch((err) => console.error('[uploads-cleanup] Startup cleanup failed', err));
        // Schedule daily cleanup
        (0, fileCleanup_1.scheduleDailyUploadsCleanup)();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
