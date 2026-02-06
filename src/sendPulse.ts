import { PoolClient } from "pg";
import axios from "axios";
import https from "https";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { MotionDetection, SensorData, TelegramData } from "./types/database";
import { threadId } from "worker_threads";
import { formatDate } from "./formatDate";
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

  let string = `============\n`;
  motionData.forEach((data) => {
    const absoluteMsDiff = Math.abs(
      currentTime.getTime() - data.timestamp.getTime(),
    );
    const isLive = absoluteMsDiff < 10 * 60 * 1000;
    string += `${data.sensor_id}: ${isLive ? "🟢" : "🔴"} \\[last seen: ${formatDate(data.timestamp)}\]\n`;
  });
  string += `============\n`;
  string += `Last Update: ${formatDate(new Date())}\n`;

  const telegramData: TelegramData = (
    await poolClient.query(
      `
    SELECT *
    FROM telegram_data
    WHERE group_id = $1 AND thread_id = $2;
        `,
      [TELEGRAM_GROUP_ID, TELEGRAM_THREAD_ID],
    )
  ).rows[0];

  if (telegramData !== undefined) {
    await axios
      .post(
        `${TELEGRAM_API}/deleteMessage`,
        {
          chat_id: TELEGRAM_GROUP_ID,
          message_id: telegramData.message_id,
        },
        { httpsAgent: agent },
      )
      .catch((e) => logger.info(e));
  }

  const response = await axios
    .post(
      `${TELEGRAM_API}/sendMessage`,
      {
        parse_mode: "markdown",
        chat_id: TELEGRAM_GROUP_ID,
        thread_id: TELEGRAM_THREAD_ID,
        text: string,
      },
      { httpsAgent: agent },
    )
    .catch((e) => {
      logger.info(e);
      return null;
    });

  const newMessageId = response?.data?.result?.message_id;
  if (newMessageId) {
    await poolClient.query(
      `INSERT INTO telegram_data (group_id, thread_id, message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, thread_id)
       DO UPDATE SET message_id = $3`,
      [TELEGRAM_GROUP_ID, TELEGRAM_THREAD_ID, newMessageId],
    );
  }
  logger.info(`Pulse sent at ${new Date().toLocaleTimeString()}`);
}
