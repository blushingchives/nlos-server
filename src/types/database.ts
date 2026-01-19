// Database table types (snake_case - matches database columns)
export type SensorData = {
  id: number;
  sensor_id: string;
  event_id: string;
  timestamp: Date;
  raw_acx: number;
  raw_acy: number;
  raw_acz: number;
  raw_gcx: number;
  raw_gcy: number;
  raw_gcz: number;
  delta_acx: number;
  delta_acy: number;
  delta_acz: number;
  delta_gcx: number;
  delta_gcy: number;
  delta_gcz: number;
};

export type SensorDataInsert = Omit<SensorData, "id" | "timestamp">;

export type MotionDetection = {
  id: number;
  sensor_id: string;
  timestamp: Date;
  occupied_status: boolean;
  detection_period: number;
  accel_threshold: number;
  gyro_threshold: number;
  motion_threshold_percent: number;
};

export type MotionDetectionInsert = Omit<MotionDetection, "id" | "timestamp">;
