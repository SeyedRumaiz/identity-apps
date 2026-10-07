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

describe("live-chat-transport", () => {
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
            const { getSupportEscalationBaseUrl } = await import("../live-chat-transport");

            expect(getSupportEscalationBaseUrl()).toBe("");
        });

        it("passes an already-absolute configured URL through unchanged", async () => {
            storeStateMock.config.endpoints.supportEscalation = "https://bridge.example.com";
            const { getSupportEscalationBaseUrl } = await import("../live-chat-transport");

            expect(getSupportEscalationBaseUrl()).toBe("https://bridge.example.com");
        });

        it("resolves a path-only configured value against window.location.origin", async () => {
            storeStateMock.config.endpoints.supportEscalation = "/console-chat-bridge";
            const { getSupportEscalationBaseUrl } = await import("../live-chat-transport");

            expect(getSupportEscalationBaseUrl()).toBe(`${window.location.origin}/console-chat-bridge`);
        });
    });

    describe("requestTransport", () => {
        it("POSTs with the expected method, headers, and body", async () => {
            httpRequestMock.mockResolvedValueOnce({ data: "{\"caseId\":\"case-1\"}", status: 202 });
            const { liveChatTransport } = await import("../live-chat-transport");

            const response: unknown = await liveChatTransport.requestTransport.postJson(
                "https://bridge.example.com/v1/identity-console/chats", { message: "Hello" });

            expect(response).toEqual({ status: 202, text: "{\"caseId\":\"case-1\"}" });
            expect(httpRequestMock).toHaveBeenCalledWith({
                data: { message: "Hello" },
                headers: { "Content-Type": "application/json" },
                method: "POST",
                url: "https://bridge.example.com/v1/identity-console/chats"
            });
        });

        it("GETs with the expected method and url", async () => {
            httpRequestMock.mockResolvedValueOnce({ data: "{}", status: 200 });
            const { liveChatTransport } = await import("../live-chat-transport");

            await liveChatTransport.requestTransport.getJson(
                "https://bridge.example.com/v1/identity-console/chats/current");

            expect(httpRequestMock).toHaveBeenCalledWith({
                method: "GET",
                url: "https://bridge.example.com/v1/identity-console/chats/current"
            });
        });

        it("re-stringifies an already-parsed JSON response body", async () => {
            // httpRequest may hand back an already-parsed object rather than a
            // raw string, since transformResponse can't be passed through the
            // webWorker's postMessage boundary (see the adapter's own comment).
            httpRequestMock.mockResolvedValueOnce({ data: { caseId: "case-2" }, status: 200 });
            const { liveChatTransport } = await import("../live-chat-transport");

            const response: { status: number; text: string } =
                await liveChatTransport.requestTransport.getJson("https://bridge.example.com/x");

            expect(JSON.parse(response.text)).toEqual({ caseId: "case-2" });
        });

        it("resolves (not throws) a non-2xx response carried on the rejection's own response", async () => {
            httpRequestMock.mockRejectedValueOnce({
                response: {
                    data: { message: "No open chat." },
                    status: 404
                }
            });
            const { liveChatTransport } = await import("../live-chat-transport");

            await expect(liveChatTransport.requestTransport.getJson("https://bridge.example.com/x"))
                .resolves.toEqual({ status: 404, text: "{\"message\":\"No open chat.\"}" });
        });

        it("rethrows a genuine transport failure with no response", async () => {
            httpRequestMock.mockRejectedValueOnce(new Error("Network unreachable"));
            const { liveChatTransport } = await import("../live-chat-transport");

            await expect(liveChatTransport.requestTransport.postJson("https://bridge.example.com/x", {}))
                .rejects.toThrow("Network unreachable");
        });
    });

    describe("streamTransport", () => {
        it("opens the stream with the expected method, headers, and url", async () => {
            const stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>();

            httpStreamRequestMock.mockResolvedValueOnce(stream);
            const { liveChatTransport } = await import("../live-chat-transport");

            await expect(liveChatTransport.streamTransport.openStream(
                "https://bridge.example.com/v1/identity-console/chats/case-1/events",
                new AbortController().signal
            )).resolves.toBe(stream);
            expect(httpStreamRequestMock).toHaveBeenCalledWith({
                headers: { Accept: "text/event-stream" },
                method: "GET",
                url: "https://bridge.example.com/v1/identity-console/chats/case-1/events"
            });
        });

        it("rejects when httpStreamRequest returns no stream", async () => {
            httpStreamRequestMock.mockResolvedValueOnce(undefined);
            const { liveChatTransport } = await import("../live-chat-transport");

            await expect(liveChatTransport.streamTransport.openStream(
                "https://bridge.example.com/x", new AbortController().signal
            )).rejects.toThrow("No stream returned");
        });
    });
});
