import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createDatabase, initializeTables } from "./database.js";
import swapRoutes from "./routes/swap.js";
import walletRoutes from "./routes/wallet.js";
import { startRelayer } from "./services/relayer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:5175"
  ],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(join(__dirname, "../public")));

// Database initialization
await createDatabase();
await initializeTables();

// Routes
app.use("/api/swap", swapRoutes);
app.use("/api/wallet", walletRoutes);

// Health check
app.get("/health", (_, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("API Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Starlink API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);

  // Start the relayer service
  startRelayer();
});