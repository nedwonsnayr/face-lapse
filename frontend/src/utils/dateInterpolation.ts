import { ImageRecord } from "../api";

export interface ImageWithDate extends ImageRecord {
  interpolated_date: string | null;
}

/**
 * Interpolate dates for images missing photo_taken_at based on chronological position.
 * Images should already be sorted chronologically.
 */
export function interpolateDates(images: ImageRecord[]): ImageWithDate[] {
  if (images.length === 0) return [];

  // Find indices of images with known dates
  const knownDateIndices: number[] = [];
  images.forEach((img, idx) => {
    if (img.photo_taken_at) {
      knownDateIndices.push(idx);
    }
  });

  // If all images have dates, return as-is
  if (knownDateIndices.length === images.length) {
    return images.map((img) => ({
      ...img,
      interpolated_date: img.photo_taken_at,
    }));
  }

  // If no images have dates, use created_at or evenly space
  if (knownDateIndices.length === 0) {
    const hasCreatedAt = images.some((img) => img.created_at);
    if (hasCreatedAt) {
      // Use created_at timestamps
      return images.map((img) => ({
        ...img,
        interpolated_date: img.created_at || null,
      }));
    } else {
      // Evenly space over a reasonable time range (e.g., 1 day per image)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - images.length);
      return images.map((img, idx) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + idx);
        return {
          ...img,
          interpolated_date: date.toISOString(),
        };
      });
    }
  }

  // Calculate average interval between known dates
  let avgIntervalMs = 0;
  if (knownDateIndices.length > 1) {
    const intervals: number[] = [];
    for (let i = 1; i < knownDateIndices.length; i++) {
      const prevIdx = knownDateIndices[i - 1];
      const currIdx = knownDateIndices[i];
      const prevDate = new Date(images[prevIdx].photo_taken_at!);
      const currDate = new Date(images[currIdx].photo_taken_at!);
      const interval = currDate.getTime() - prevDate.getTime();
      const numImages = currIdx - prevIdx;
      intervals.push(interval / numImages);
    }
    avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  } else {
    // Single known date - use created_at spacing if available
    const knownIdx = knownDateIndices[0];
    const knownDate = new Date(images[knownIdx].photo_taken_at!);
    if (images[knownIdx].created_at) {
      const createdDate = new Date(images[knownIdx].created_at);
      avgIntervalMs = Math.abs(createdDate.getTime() - knownDate.getTime()) / Math.max(1, knownIdx);
    } else {
      // Default to 1 day per image
      avgIntervalMs = 24 * 60 * 60 * 1000;
    }
  }

  // Interpolate dates
  const result: ImageWithDate[] = images.map((img, idx) => {
    // If image has a date, use it
    if (img.photo_taken_at) {
      return {
        ...img,
        interpolated_date: img.photo_taken_at,
      };
    }

    // Find the nearest known dates before and after
    let beforeIdx = -1;
    let afterIdx = -1;

    for (let i = knownDateIndices.length - 1; i >= 0; i--) {
      if (knownDateIndices[i] < idx) {
        beforeIdx = knownDateIndices[i];
        break;
      }
    }

    for (let i = 0; i < knownDateIndices.length; i++) {
      if (knownDateIndices[i] > idx) {
        afterIdx = knownDateIndices[i];
        break;
      }
    }

    let interpolatedDate: Date;

    if (beforeIdx >= 0 && afterIdx >= 0) {
      // Linear interpolation between two known dates
      const beforeDate = new Date(images[beforeIdx].photo_taken_at!);
      const afterDate = new Date(images[afterIdx].photo_taken_at!);
      const totalInterval = afterDate.getTime() - beforeDate.getTime();
      const position = (idx - beforeIdx) / (afterIdx - beforeIdx);
      interpolatedDate = new Date(beforeDate.getTime() + totalInterval * position);
    } else if (beforeIdx >= 0) {
      // Extrapolate forward from last known date
      const beforeDate = new Date(images[beforeIdx].photo_taken_at!);
      const offset = (idx - beforeIdx) * avgIntervalMs;
      interpolatedDate = new Date(beforeDate.getTime() + offset);
    } else if (afterIdx >= 0) {
      // Extrapolate backward from first known date
      const afterDate = new Date(images[afterIdx].photo_taken_at!);
      const offset = (idx - afterIdx) * avgIntervalMs;
      interpolatedDate = new Date(afterDate.getTime() + offset);
    } else {
      // Fallback (shouldn't happen)
      interpolatedDate = new Date();
    }

    return {
      ...img,
      interpolated_date: interpolatedDate.toISOString(),
    };
  });

  return result;
}
