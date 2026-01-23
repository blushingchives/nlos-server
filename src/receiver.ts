import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { Pool, PoolClient } from "pg";
import https from "https";
import pino from "pino";
import { CreateDatabaseClient } from "./tools/CreateDatabaseClient";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { Queue } from "./tools/Queue";
import { sendUpdate } from "./sendUpdate";

const agent = new https.Agent({ family: 4 }); // forces IPv4

const logger = CreateLoggerClient();

// Environment Variables
require("dotenv").config();
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const SERVER_URL = process.env.SERVER_URL;
const DATABASE_CONNECTION_STRING = process.env.DATABASE_CONNECTION_STRING;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;

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

  app.listen(5000, async () => {
    logger.info(`Listening on port 5000`);
    logger.info(`Server ready to receive`);
  });
};
app.get("/", (_, res) => {
  return res.send("HELLO");
});

type MotionHistory = {
  [key: string]: {
    queue: Queue<number>;
    occupied: boolean;
  };
};
const motionHistory: MotionHistory = {};
const detectionPeriod = 50;
const MIN_SAMPLES_FOR_OUTLIER_DETECTION = 10; // Need baseline data before filtering
const OUTLIER_SIGMA_MULTIPLIER = 5; // Cap values beyond 3 standard deviations
const MOTION_THRESHOLD_PERCENT = 66; // 66% threshold for status change

app.post("/flush", async (req, res) => {
  res.send({ success: true });

  const data: {
    sensor_id: string;
    event_id: string;
  } = req.body;

  logger.info(
    `FLush Data Received | Sensor Id: ${data.sensor_id} | Event Id: ${data.event_id}`
  );

  if (motionHistory[data.sensor_id] !== undefined) {
    motionHistory[data.sensor_id].queue = new Queue<number>(detectionPeriod);
  }
});

app.post("/submit", async (req, res) => {
  res.send({ success: true });

  const data: {
    sensor_id: string;
    event_id: string;
    delta_acx: number;
    delta_acy: number;
    delta_acz: number;
    delta_gyx: number;
    delta_gyy: number;
    delta_gyz: number;
    raw_acx: number;
    raw_acy: number;
    raw_acz: number;
    raw_gyx: number;
    raw_gyy: number;
    raw_gyz: number;
    baseline_acx: number;
    baseline_acy: number;
    baseline_acz: number;
    baseline_gyx: number;
    baseline_gyy: number;
    baseline_gyz: number;
  } = req.body;

  logger.info(
    `Sensor Data Received | Sensor Id: ${data.sensor_id} | Event Id: ${data.event_id}`
  );

  // Try different scale factors to diagnose
  const scaleFactor = 16384.0; // ±2g range
  // const scaleFactor = 8192.0;  // ±4g range (uncomment to test)
  // const scaleFactor = 4096.0;  // ±8g range (uncomment to test)
  // const scaleFactor = 2048.0;  // ±16g range (uncomment to test)

  const ax_g = data.raw_acx / scaleFactor;
  const ay_g = data.raw_acy / scaleFactor;
  const az_g = data.raw_acz / scaleFactor;
  const baseline_ax_g = data.baseline_acx / scaleFactor;
  const baseline_ay_g = data.baseline_acy / scaleFactor;
  const baseline_az_g = data.baseline_acz / scaleFactor;

  const mag = Math.abs(Math.sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g) - 1);

  // Initialize sensor history if needed
  if (motionHistory[data.sensor_id] === undefined) {
    const newHistory = {
      queue: new Queue<number>(detectionPeriod),
      occupied: false,
    };
    motionHistory[data.sensor_id] = newHistory;
  }

  // Calculate vibration as deviation from baseline (better for tilted sensors)
  const dx = ax_g - (baseline_ax_g || ax_g);
  const dy = ay_g - (baseline_ay_g || ay_g);
  const dz = az_g - (baseline_az_g || az_g);

  // Vibration is the magnitude of change from baseline
  let rawVibration = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let vibration = Math.min(rawVibration, 0.05);
  // let vibration = rawVibration;

  // Outlier rejection: cap extreme spikes based on recent history
  // const recentValues = motionHistory[data.sensor_id].queue.toArray();
  // if (recentValues.length >= MIN_SAMPLES_FOR_OUTLIER_DETECTION) {
  //   const mean =
  //     recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
  //   const variance =
  //     recentValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
  //     recentValues.length;
  //   const stdDev = Math.sqrt(variance);

  //   // Cap vibration at mean + 3σ to reject extreme outliers
  //   const maxAllowed = mean + OUTLIER_SIGMA_MULTIPLIER * stdDev;
  //   vibration = Math.min(vibration, maxAllowed);
  // }

  motionHistory[data.sensor_id].queue.enqueue(vibration);
  const rms = calculateRMS(motionHistory[data.sensor_id].queue.toArray());

  // // Diagnostic logging
  // logger.info(
  //   `Mag: ${mag.toFixed(4)}g | Vibration: ${vibration.toFixed(
  //     5
  //   )}g | RMS: ${rms.toFixed(5)}g | ` +
  //     `Normalised: [${dx}, ${dy}, ${dz}] ` +
  //     `Raw: [${data.raw_acx}, ${data.raw_acy}, ${data.raw_acz}] ` +
  //     `Baseline: [${data.baseline_acx}, ${data.baseline_acy}, ${data.baseline_acz}] `
  // );

  const RMS_THRESHOLD_OCCUPIED = 0.03;
  const RMS_THRESHOLD_FREE = 0.02;

  const oldOccupiedStatus = motionHistory[data.sensor_id].occupied;

  // Simple hysteresis-based detection
  if (rms > RMS_THRESHOLD_OCCUPIED) {
    motionHistory[data.sensor_id].occupied = true;
  } else if (rms < RMS_THRESHOLD_FREE) {
    motionHistory[data.sensor_id].occupied = false;
  }
  // else: in hysteresis zone, keep current state

  let string = ``;
  Object.keys(motionHistory).forEach((key) => {
    const rms = calculateRMS(motionHistory[key].queue.toArray());
    string += `${key}: [ Raw: ${motionHistory[key].queue
      .toArray()
      .at(-1)
      ?.toFixed(5)} RMS (5dp): ${rms.toFixed(
      5
    )} RTO: ${RMS_THRESHOLD_OCCUPIED} RTF: ${RMS_THRESHOLD_FREE} ]\n`;
  });
  logger.info(string);

  await poolClient.query(
    `INSERT INTO sensor_data (
          sensor_id, event_id,
          raw_acx, raw_acy, raw_acz, raw_gyx, raw_gyy, raw_gyz,
          delta_acx, delta_acy, delta_acz, delta_gyx, delta_gyy, delta_gyz,
          baseline_acx, baseline_acy, baseline_acz, baseline_gyx, baseline_gyy, baseline_gyz
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      data.sensor_id,
      data.event_id,
      data.raw_acx,
      data.raw_acy,
      data.raw_acz,
      data.raw_gyx,
      data.raw_gyy,
      data.raw_gyz,
      data.delta_acx,
      data.delta_acy,
      data.delta_acz,
      data.delta_gyx,
      data.delta_gyy,
      data.delta_gyz,
      data.baseline_acx,
      data.baseline_acy,
      data.baseline_acz,
      data.baseline_gyx,
      data.baseline_gyy,
      data.baseline_gyz,
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
            rms, rms_threshold_free, rms_threshold_occupied
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.sensor_id,
        motionHistory[data.sensor_id].occupied,
        detectionPeriod,
        rms,
        RMS_THRESHOLD_FREE,
        RMS_THRESHOLD_OCCUPIED,
      ]
    );

    sendUpdate(poolClient, TELEGRAM_GROUP_ID, TELEGRAM_API);
  }

  return;
});
function calculateRMS(arr: number[]) {
  return Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0) / arr.length);
}
init();
