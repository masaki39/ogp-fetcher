export interface OGPMetadata {
  title: string | undefined;
  description: string | undefined;
  image: string | undefined;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

export interface FetchOGPOptions {
  timeout?: number;
  maxSize?: number;
}

export interface FetchOGPResult {
  success: true;
  html: string;
}

export interface FetchOGPError {
  success: false;
  error: string;
  statusCode: number;
}

export type FetchOGPResponse = FetchOGPResult | FetchOGPError;
