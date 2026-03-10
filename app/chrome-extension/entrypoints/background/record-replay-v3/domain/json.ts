/**
 * @fileoverview JSON base type definitions.
 * @description Defines the JSON-related types used by Record-Replay V3.
 */

/** JSON primitive types. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON object type. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** JSON array type. */
export type JsonArray = JsonValue[];

/** Arbitrary JSON value type. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** ISO 8601 date-time string. */
export type ISODateTimeString = string;

/** Unix timestamp in milliseconds. */
export type UnixMillis = number;
