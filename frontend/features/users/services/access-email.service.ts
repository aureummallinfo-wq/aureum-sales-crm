import type { AccessEmailPayload, AccessEmailResult } from "../types/user-access.types";
export function buildAccessEmailPayload(input: AccessEmailPayload): AccessEmailPayload { return { ...input }; }
export function sendAccessEmailMock(): AccessEmailResult { return { success: true, status: "sent", message: "Access email sent successfully.", sentAt: new Date().toISOString() }; }
export function resendAccessEmailMock(): AccessEmailResult { return sendAccessEmailMock(); }
