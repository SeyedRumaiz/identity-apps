/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpRequestMock: Mock = vi.hoisted(() => vi.fn());
const httpStreamRequestMock: Mock = vi.hoisted(() => vi.fn());

const storeStateMock: { config: { endpoints: { supportEscalation: string } } } = vi.hoisted(() => ({
    config: {
        endpoints: {
            supportEscalation: ""
        }
    }
}));

vi.mock("@asgardeo/auth-react", () => ({
    AsgardeoSPAClient: {
        getInstance: vi.fn(() => ({
            httpRequest: httpRequestMock,
            httpStreamRequest: httpStreamRequestMock
        }))
    }
}));

vi.mock("@wso2is/admin.core.v1/store", () => ({
    store: {
        getState: () => storeStateMock
    }
}));

describe("live-chat-client", () => {
    beforeEach(() => {
        httpRequestMock.mockReset();
        httpStreamRequestMock.mockReset();
        storeStateMock.config.endpoints.supportEscalation = "";
    });

    afterEach(() => {
        vi.resetModules();
    });

    describe("getSupportEscalationBaseUrl", () => {
        it("returns an empty string when unconfigured", async () => {
            const { getSupportEscalationBaseUrl } = await import("../live-chat-client");

            expect(getSupportEscalationBaseUrl()).toBe("");
        });

        it("passes an already-absolute configured URL through unchanged", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            const { getSupportEscalationBaseUrl } = await import("../live-chat-client");

            expect(getSupportEscalationBaseUrl()).toBe("https://bridge.example.com");
        });

        it("resolves a path-only configured value against window.location.origin", async () => {
            storeStateMock.config.endpoints.supportEscalation = "/console-chat-bridge";
            const { getSupportEscalationBaseUrl } = await import("../live-chat-client");

            expect(getSupportEscalationBaseUrl()).toBe(`${ window.location.origin }/console-chat-bridge`);
        });
    });

    describe("getLiveChatClient", () => {
        it("returns null when unconfigured", async () => {
            const { getLiveChatClient } = await import("../live-chat-client");

            expect(getLiveChatClient()).toBeNull();
        });

        it("returns the same memoized instance for the same base URL", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            const { getLiveChatClient } = await import("../live-chat-client");

            const first: unknown = getLiveChatClient();
            const second: unknown = getLiveChatClient();

            expect(first).not.toBeNull();
            expect(first).toBe(second);
        });
    });

    describe("requestTransport (exercised via startChat)", () => {
        it("POSTs with the expected method, headers, and body", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            httpRequestMock.mockResolvedValueOnce({
                data: JSON.stringify({ caseId: "case-1", conversationId: "conv-1" }),
                status: 200
            });
            const { getLiveChatClient } = await import("../live-chat-client");

            const result: unknown = await getLiveChatClient()?.startChat({ message: "Hello" });

            expect(result).toEqual({ caseId: "case-1", conversationId: "conv-1" });
            expect(httpRequestMock).toHaveBeenCalledWith(expect.objectContaining({
                data: { message: "Hello" },
                headers: { "Content-Type": "application/json" },
                method: "POST",
                url: expect.stringContaining("/v1/identity-console/chats")
            }));
        });

        it("re-stringifies an already-parsed JSON response body", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            // httpRequest may hand back an already-parsed object rather than a
            // raw string, since transformResponse can't be passed through the
            // webWorker's postMessage boundary (see the adapter's own comment).
            httpRequestMock.mockResolvedValueOnce({
                data: { caseId: "case-2", conversationId: "conv-2" },
                status: 200
            });
            const { getLiveChatClient } = await import("../live-chat-client");

            const result: unknown = await getLiveChatClient()?.startChat({ message: "Hello" });

            expect(result).toEqual({ caseId: "case-2", conversationId: "conv-2" });
        });

        it("resolves (not throws) a non-2xx response carried on the rejection's own response", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            httpRequestMock.mockRejectedValueOnce({
                response: {
                    data: JSON.stringify({ message: "Tenant not found." }),
                    status: 404
                }
            });
            const { getLiveChatClient } = await import("../live-chat-client");

            await expect(getLiveChatClient()?.startChat({ message: "Hello" })).rejects.toMatchObject({
                message: expect.stringContaining("Tenant not found.")
            });
        });

        it("rethrows a genuine transport failure with no response", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            httpRequestMock.mockRejectedValueOnce(new Error("Network unreachable"));
            const { getLiveChatClient } = await import("../live-chat-client");

            await expect(getLiveChatClient()?.startChat({ message: "Hello" })).rejects.toMatchObject({
                message: "Network unreachable"
            });
        });
    });

    describe("streamTransport (exercised via subscribe)", () => {
        it("opens the stream with the expected method, headers, and url", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            httpStreamRequestMock.mockResolvedValueOnce(new ReadableStream<Uint8Array>({
                start: (controller: ReadableStreamDefaultController<Uint8Array>) => controller.close()
            }));
            const { getLiveChatClient } = await import("../live-chat-client");

            const unsubscribe: (() => void) | undefined = getLiveChatClient()?.subscribe("case-1", () => {
                // Frames aren't asserted here; this test only checks the
                // adapter's own call to httpStreamRequest.
            });

            await vi.waitFor(() => expect(httpStreamRequestMock).toHaveBeenCalledWith(expect.objectContaining({
                headers: { Accept: "text/event-stream" },
                method: "GET",
                url: expect.stringContaining("/v1/identity-console/chats/case-1/events")
            })));

            unsubscribe?.();
        });

        it("surfaces an error event when httpStreamRequest returns no stream", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            httpStreamRequestMock.mockResolvedValueOnce(undefined);
            const onEvent: Mock = vi.fn();
            const { getLiveChatClient } = await import("../live-chat-client");

            const unsubscribe: (() => void) | undefined = getLiveChatClient()?.subscribe("case-1", onEvent);

            await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: "error"
            })));

            unsubscribe?.();
        });
    });
});
