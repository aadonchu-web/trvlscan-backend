import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express from "express";
import flightsRouter from "./routes/flights";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/flights", flightsRouter);

const appRouter = (app as any)._router ?? (app as any).router;

if (appRouter?.stack) {
  appRouter.stack.forEach((middleware: any) => {
    if (middleware.route) {
      console.log("Route:", middleware.route.path);
    } else if (middleware.name === "router") {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          console.log("Router route:", handler.route.path, handler.route.methods);
        }
      });
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
  });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
