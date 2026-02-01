import { PoolClient } from "pg";
import axios from "axios";
import https from "https";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { MotionDetection, SensorData } from "./types/database";
import { threadId } from "worker_threads";
const agent = new https.Agent({ family: 4 }); // forces IPv4

const logger = CreateLoggerClient();

export async function sendPulse(
  poolClient: PoolClient,
  TELEGRAM_GROUP_ID: string,
  TELEGRAM_THREAD_ID: string,
  TELEGRAM_API: string,
) {
  const currentTime = new Date();
  const motionData: SensorData[] = (
    await poolClient.query(
      `
    SELECT DISTINCT ON (sensor_id) *
    FROM sensor_data
    ORDER BY sensor_id, timestamp DESC;
        `,
    )
  ).rows;

  if (motionData.length === 0) {
    return;
  }

  let string = `===  NLOS  ===\n`;
  motionData.forEach((data) => {
    const absoluteMsDiff = Math.abs(
      currentTime.getTime() - data.timestamp.getTime(),
    );
    const isLive = absoluteMsDiff < 10 * 60 * 1000;
    const year = data.timestamp.getFullYear();
    // Add 1 to month because getMonth() returns 0-indexed values
    const month = (data.timestamp.getMonth() + 1).toString().padStart(2, "0");
    const day = data.timestamp.getDate().toString().padStart(2, "0");
    const hours = data.timestamp.getHours().toString().padStart(2, "0");
    const minutes = data.timestamp.getMinutes().toString().padStart(2, "0");

    // Format as "DD-MM-YYYY HH:MM"
    const formattedDate = `${hours}:${minutes}, ${day}-${month}-${year}`;

    string += `${data.sensor_id}: ${isLive ? "🟢" : "🔴"} [${formattedDate}]\n`;
  });

  await axios
    .post(
      `${TELEGRAM_API}/sendMessage`,
      {
        parse_mode: "markdown",
        chat_id: TELEGRAM_GROUP_ID,
        message_thread_id: TELEGRAM_THREAD_ID,
        disable_web_page_preview: true,
        text: string,
      },
      { httpsAgent: agent },
    )
    .catch((e) => logger.info(e));

  logger.info(`Pulse sent at ${new Date().toLocaleTimeString()}`);
}
