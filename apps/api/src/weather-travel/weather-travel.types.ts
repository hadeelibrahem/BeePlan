export type Coordinates = { latitude: number; longitude: number };
export type TravelMode = 'driving' | 'walking' | 'cycling';
export type WeatherPoint = Coordinates & {
  provider: string;
  timezone: string;
  forecastTime: string;
  temperatureC: number;
  feelsLikeC: number;
  weatherCode: number;
  condition: string;
  precipitationProbabilityPercent: number;
  precipitationMm: number;
  windSpeedKph: number;
  windGustKph: number;
  humidityPercent: number;
  uvIndex: number | null;
  visibilityMeters: number;
  isDay: boolean;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
};
export interface WeatherProvider {
  getCurrentWeather(
    input: Coordinates & { timezone: string },
  ): Promise<WeatherPoint>;
  getHourlyForecast(
    input: Coordinates & {
      startTime: string;
      endTime: string;
      timezone: string;
    },
  ): Promise<WeatherPoint[]>;
}
export type RouteEstimate = {
  distanceMeters: number;
  durationMinutes: number;
  travelMode: TravelMode;
  provider: string;
  routeCalculatedAt: string;
  expiresAt: string;
  confidence: 'high' | 'medium' | 'low';
  fallbackUsed: boolean;
};
export interface TravelTimeProvider {
  estimateRoute(input: {
    origin: Coordinates;
    destination: Coordinates;
    mode: TravelMode;
    departureTime: string;
    allowFallback: boolean;
  }): Promise<RouteEstimate | null>;
}
export type Destination = Coordinates & {
  displayName: string;
  address?: string | null;
  savedPlaceId?: string | null;
};
export type OriginSource =
  | 'previous_scheduled_location'
  | 'current_location'
  | 'home'
  | 'selected_saved_place'
  | 'unavailable';
export type RecommendationType =
  | 'cold_clothing'
  | 'very_cold_clothing'
  | 'hot_clothing'
  | 'extreme_heat'
  | 'umbrella'
  | 'rain_protection'
  | 'hydration'
  | 'uv_protection'
  | 'strong_wind'
  | 'low_visibility'
  | 'severe_weather'
  | 'leave_earlier';
