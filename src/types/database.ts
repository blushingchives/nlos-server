// Database table types (snake_case - matches database columns)
export type SensorData = {
  id: number;
  sensor_id: string;
  event_id: string;
  timestamp: Date;
  raw_acx: number;
  raw_acy: number;
  raw_acz: number;
  raw_gyx: number;
  raw_gyy: number;
  raw_gyz: number;
  delta_acx: number;
  delta_acy: number;
  delta_acz: number;
  delta_gyx: number;
  delta_gyy: number;
  delta_gyz: number;
  baseline_acx: number;
  baseline_acy: number;
  baseline_acz: number;
  baseline_gyx: number;
  baseline_gyy: number;
  baseline_gyz: number;
};

export type SensorDataInsert = Omit<SensorData, "id" | "timestamp">;

export type MotionDetection = {
  id: number;
  sensor_id: string;
  timestamp: Date;
  occupied_status: boolean;
  detection_period: number;
  rms: number;
  rms_threshold_free: number;
  rms_thresholds_occupied: number;
};

export type MotionDetectionInsert = Omit<MotionDetection, "id" | "timestamp">;

export type TelegramData = {
  group_id: string;
  thread_id: string;
  message_id: string;
};
