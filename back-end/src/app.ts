import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileRoutes from './routes/fileRoutes';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '7000', 10);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors({ origin: '*'}));
app.use(express.json());

app.use('/', fileRoutes);

app.get('/', (req, res) => {
  res.send('CV Reformat Backend Running');
});

// Initialize database and start server
const startServer = async () => {
  try {
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 