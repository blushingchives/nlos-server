import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { Pool, PoolClient } from "pg";
import https from "https";
import pino from "pino";
import { CreateDatabaseClient } from "./tools/CreateDatabaseClient";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { Queue } from "./tools/Queue";

const agent = new https.Agent({ family: 4 }); // forces IPv4

const logger = CreateLoggerClient();

// Environment Variables
require("dotenv").config();
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const SERVER_URL = process.env.SERVER_URL;
const DATABASE_CONNECTION_STRING = process.env.DATABASE_CONNECTION_STRING;

// Motion detection thresholds
const ACCEL_THRESHOLD = 150; // Accelerometer change threshold
const GYRO_THRESHOLD = 1000; // Gyroscope change threshold

// Telegram URLs
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_API_KEY}`;
const URI = `/webhook/${TELEGRAM_API_KEY}`;
const WEBHOOK_URL = `${SERVER_URL}${URI}`;

var poolClient: PoolClient;

const app = express();
app.use(bodyParser.json());

const init = async () => {
  poolClient = await CreateDatabaseClient(DATABASE_CONNECTION_STRING);

  app.listen(80, async () => {
    logger.info(`Listening on port 80`);
    logger.info(`Server running on ${SERVER_URL}`);
    logger.info(`Server ready to receive`);
  });
};
app.get("/", (_, res) => {
  return res.send("HELLO");
});

type MotionHistory = {
  [key: string]: {
    queue: Queue<any>;
    occupied: boolean;
    baseline_ax?: number;
    baseline_ay?: number;
    baseline_az?: number;
  };
};
const motionHistory: MotionHistory = {};
const detectionPeriod = 50;
const MOTION_THRESHOLD_PERCENT = 66; // 66% threshold for status change

app.post("/submit", async (req, res) => {
  res.send({ success: true });

  const data: {
    sensor_id: string;
    event_id: string;
    delta_acx: number;
    delta_acy: number;
    delta_acz: number;
    delta_gcx: number;
    delta_gcy: number;
    delta_gcz: number;
    raw_acx: number;
    raw_acy: number;
    raw_acz: number;
    raw_gcx: number;
    raw_gcy: number;
    raw_gcz: number;
  } = req.body;

  logger.info(
    `Sensor Data Received | Sensor Id: ${data.sensor_id} | Event Id: ${data.event_id}`
  );

  // // Try different scale factors to diagnose
  // const scaleFactor = 16384.0; // ±2g range
  // // const scaleFactor = 8192.0;  // ±4g range (uncomment to test)
  // // const scaleFactor = 4096.0;  // ±8g range (uncomment to test)
  // // const scaleFactor = 2048.0;  // ±16g range (uncomment to test)

  // const ax_g = data.raw_acx / scaleFactor;
  // const ay_g = data.raw_acy / scaleFactor;
  // const az_g = data.raw_acz / scaleFactor;

  // const mag = Math.abs(Math.sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g) - 1);

  // // Initialize sensor history if needed
  // if (motionHistory[data.sensor_id] === undefined) {
  //   const newHistory = {
  //     queue: new Queue<number>(detectionPeriod),
  //     occupied: false,
  //     baseline_ax: ax_g, // Set initial baseline
  //     baseline_ay: ay_g,
  //     baseline_az: az_g,
  //   };
  //   motionHistory[data.sensor_id] = newHistory;
  // }

  // // Calculate vibration as deviation from baseline (better for tilted sensors)
  // const dx = ax_g - (motionHistory[data.sensor_id].baseline_ax || ax_g);
  // const dy = ay_g - (motionHistory[data.sensor_id].baseline_ay || ay_g);
  // const dz = az_g - (motionHistory[data.sensor_id].baseline_az || az_g);

  // // Vibration is the magnitude of change from baseline
  // const vibration = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // motionHistory[data.sensor_id].queue.enqueue(vibration);
  // const rms = Math.sqrt(
  //   motionHistory[data.sensor_id].queue
  //     .toArray()
  //     .reduce((sum, val) => sum + val * val, 0) /
  //     motionHistory[data.sensor_id].queue.size()
  // );

  // // Diagnostic logging
  // logger.info(
  //   `Mag: ${mag.toFixed(4)}g | Vibration: ${vibration.toFixed(
  //     5
  //   )}g | RMS: ${rms.toFixed(5)}g | ` +
  //     `Raw: [${data.raw_acx}, ${data.raw_acy}, ${data.raw_acz}]`
  // );
  // return;
  // Check if motion detected
  const motionDetected =
    data.delta_acx > ACCEL_THRESHOLD ||
    data.delta_acy > ACCEL_THRESHOLD ||
    data.delta_acz > ACCEL_THRESHOLD ||
    data.delta_gcx > GYRO_THRESHOLD ||
    data.delta_gcy > GYRO_THRESHOLD ||
    data.delta_gcz > GYRO_THRESHOLD;

  if (motionHistory[data.sensor_id] === undefined) {
    const newHistory = {
      queue: new Queue<boolean>(detectionPeriod),
      occupied: false,
    };
    motionHistory[data.sensor_id] = newHistory;
  }
  motionHistory[data.sensor_id].queue.enqueue(motionDetected);

  let motionCount = 0;
  motionHistory[data.sensor_id].queue.toArray().forEach((isOccupied) => {
    if (isOccupied) {
      motionCount++;
    }
  });

  const motionPercent = (motionCount * 100) / 50;
  const stationaryPercent = 100 - motionPercent;

  const oldOccupiedStatus = motionHistory[data.sensor_id].occupied;
  if (motionPercent > MOTION_THRESHOLD_PERCENT) {
    motionHistory[data.sensor_id].occupied = true; // Change to motion
  } else if (stationaryPercent > MOTION_THRESHOLD_PERCENT) {
    motionHistory[data.sensor_id].occupied = false; // Change to stationary
  }

  let string = ``;
  Object.keys(motionHistory).forEach((key) => {
    let count = 0;
    motionHistory[key].queue.toArray().forEach((isOccupied) => {
      if (isOccupied) {
        count++;
      }
    });
    string += `${key}: [${count}/${detectionPeriod}]\n`;
  });
  logger.info(string);
  await poolClient.query(
    `INSERT INTO sensor_data (
          sensor_id, event_id,
          raw_acx, raw_acy, raw_acz, raw_gcx, raw_gcy, raw_gcz,
          delta_acx, delta_acy, delta_acz, delta_gcx, delta_gcy, delta_gcz
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      data.sensor_id,
      data.event_id,
      data.raw_acx,
      data.raw_acy,
      data.raw_acz,
      data.raw_gcx,
      data.raw_gcy,
      data.raw_gcz,
      data.delta_acx,
      data.delta_acy,
      data.delta_acz,
      data.delta_gcx,
      data.delta_gcy,
      data.delta_gcz,
    ]
  );

  // Save motion detection status only on status change
  if (motionHistory[data.sensor_id].occupied !== oldOccupiedStatus) {
    logger.info(
      `Status Change | Sensor Id: ${data.sensor_id} | Event Id: ${data.event_id}`
    );
    await poolClient.query(
      `INSERT INTO motion_detection (
            sensor_id, occupied_status, detection_period,
            accel_threshold, gyro_threshold, motion_threshold_percent
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.sensor_id,
        motionHistory[data.sensor_id].occupied,
        detectionPeriod,
        ACCEL_THRESHOLD,
        GYRO_THRESHOLD,
        MOTION_THRESHOLD_PERCENT,
      ]
    );
  }
});

init();
