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

import { AsgardeoSPAClient, HttpClientInstance } from "@asgardeo/auth-react";
import { AppState, store } from "@wso2is/admin.core.v1/store";
import { HttpMethods } from "@wso2is/core/models";
import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

/**
 * Client for console-chat-bridge (apps/console-chat-bridge/backend in
 * cs-tools) -- the small standalone service that lets this panel's
 * "Chat with an Engineer" button escalate into the existing
 * chat-routing-service/csm-portal/backend live-engineer-chat framework
 * without this app ever calling either directly. See that bridge's own
 * README for the full design and its POC's known-issuer scoping.
 *
 * Auth is identical to copilot-api.ts: AsgardeoSPAClient attaches this
 * Console session's own access token automatically. The bridge validates
 * it (via token introspection against the one known WSO2 IS instance it's
 * configured for) and derives identity from that -- never from any field
 * this module sends.
 */

const httpClient: HttpClientInstance =
    AsgardeoSPAClient.getInstance().httpRequest.bind(AsgardeoSPAClient.getInstance());

/** One message from the Ask AI conversation, given as context to the engineer. */
export interface EscalationPriorMessageInterface {
    role: "customer" | "assistant";
    content: string;
    createdAt?: string;
}

export interface EscalateToEngineerRequestInterface {
    /** Ask AI's stable per-panel-session context id -- see CopilotPanelStateInterface.askAiContextId. */
    askAiContextId: string;
    /** The question the admin asked when Ask AI errored. */
    question: string;
    /** The error Ask AI actually showed, given to the engineer as extra context. */
    errorContext?: string;
    priorMessages?: EscalationPriorMessageInterface[];
}

export interface EscalateToEngineerResponseInterface {
    caseId: string;
}

/**
 * Error thrown by this module's calls. status is set from the HTTP
 * response when available (e.g. 409 for "you already have an open chat",
 * surfaced by console-chat-bridge straight from csm-portal/backend).
 */
export type SupportEscalationApiError = Error & { status?: number };

/**
 * Returns console-chat-bridge's configured base URL, or "" if this
 * deployment hasn't set one up (see app.ts's own doc comment on
 * DeploymentConfigInterface.extensions.consoleChatBridgeBaseUrl) --
 * callers treat an empty value as "this feature isn't available here" and
 * do not attempt any of the calls below.
 */
export const getSupportEscalationBaseUrl = (): string => {
    const state: AppState = store.getState();

    return state.config?.endpoints?.supportEscalation ?? "";
};

const buildError = (error: AxiosError, fallback: string): SupportEscalationApiError => {
    const data: Record<string, unknown> = (error?.response?.data as Record<string, unknown>) || {};
    const err: SupportEscalationApiError = new Error(
        (data.message as string) || error.message || fallback
    );

    err.status = error?.response?.status;

    return err;
};

/**
 * Escalates to a live engineer: POST /support/chats.
 *
 * @param payload - Escalation request payload.
 * @returns The newly-minted caseId.
 */
export const escalateToEngineer = async (
    payload: EscalateToEngineerRequestInterface
): Promise<EscalateToEngineerResponseInterface> => {
    const requestConfig: AxiosRequestConfig = {
        data: payload,
        headers: { "Content-Type": "application/json" },
        method: HttpMethods.POST,
        url: `${ getSupportEscalationBaseUrl() }/support/chats`
    };

    return httpClient(requestConfig)
        .then((response: AxiosResponse) => response.data as EscalateToEngineerResponseInterface)
        .catch((error: AxiosError) => {
            throw buildError(error, "Failed to reach a support engineer.");
        });
};

/**
 * Sends one message on an already-connected engineer chat:
 * POST /support/chats/{caseId}/messages.
 *
 * @param caseId - The escalation's caseId (from escalateToEngineer).
 * @param message - The message text.
 */
export const sendEngineerChatMessage = async (caseId: string, message: string): Promise<void> => {
    const requestConfig: AxiosRequestConfig = {
        data: { message },
        headers: { "Content-Type": "application/json" },
        method: HttpMethods.POST,
        url: `${ getSupportEscalationBaseUrl() }/support/chats/${ caseId }/messages`
    };

    await httpClient(requestConfig).catch((error: AxiosError) => {
        throw buildError(error, "Failed to send your message.");
    });
};

/** One parsed event from console-chat-bridge's SSE stream -- mirrors csm-portal/backend's own chatEvent shape. */
export interface EngineerChatEventInterface {
    type: string;
    caseId?: string;
    conversationId?: string;
    engineerEmail?: string;
    message?: string;
    entityCaseId?: string;
    timestamp?: string;
}

export interface EngineerStreamCallbacksInterface {
    onEvent: (event: EngineerChatEventInterface) => void;
    onError?: (error: string) => void;
}

/**
 * Subscribes to GET /support/chats/{caseId}/stream via
 * AsgardeoSPAClient.httpStreamRequest -- the exact same streaming mechanism
 * copilot-api.ts's own sendCopilotChatMessage already uses for Ask AI's
 * answer streaming, so this introduces no new client-side transport
 * concept. Resolves once the stream ends (engineer disconnected, error, or
 * signal aborted) -- callers await it inside a thunk the same way
 * sendCopilotChatMessage's caller does.
 *
 * @param caseId - The escalation's caseId.
 * @param callbacks - Callbacks for each parsed event / error.
 * @param signal - Optional AbortSignal for cancellation.
 */
export const streamEngineerChat = async (
    caseId: string,
    callbacks: EngineerStreamCallbacksInterface,
    signal?: AbortSignal
): Promise<void> => {
    const spaClient: AsgardeoSPAClient = AsgardeoSPAClient.getInstance();

    const stream: ReadableStream<Uint8Array> | undefined = await spaClient.httpStreamRequest({
        headers: { "Accept": "text/event-stream" },
        method: "GET",
        url: `${ getSupportEscalationBaseUrl() }/support/chats/${ caseId }/stream`
    });

    if (!stream) {
        callbacks.onError?.("No stream returned — httpStreamRequest requires WebWorker storage.");

        return;
    }

    const reader: ReadableStreamDefaultReader<Uint8Array> = stream.getReader();
    const decoder: TextDecoder = new TextDecoder();
    let buffer: string = "";

    const abortHandler = (): void => {
        reader.cancel();
    };

    signal?.addEventListener("abort", abortHandler);

    try {
        let done: boolean = false;

        while (!done) {
            const result: ReadableStreamReadResult<Uint8Array> = await reader.read();

            if (result.done) {
                done = true;
                continue;
            }

            buffer += decoder.decode(result.value, { stream: true });

            // console-chat-bridge writes one "data: <json>\n\n" block per
            // event (plus ": heartbeat\n\n" comment lines, which never
            // start with "data:" and are simply skipped below).
            const parts: string[] = buffer.split("\n\n");

            buffer = parts.pop() || "";

            for (const part of parts) {
                const dataLine: string | undefined = part
                    .split("\n")
                    .map((line: string) => line.trim())
                    .find((line: string) => line.startsWith("data:"));

                if (!dataLine) {
                    continue;
                }

                const jsonStr: string = dataLine.slice(dataLine.indexOf(":") + 1).trim();

                try {
                    callbacks.onEvent(JSON.parse(jsonStr) as EngineerChatEventInterface);
                } catch (e) {
                    // Silently skip a malformed event, matching
                    // copilot-api.ts's parseSSEChunk's own convention.
                }
            }
        }
    } finally {
        signal?.removeEventListener("abort", abortHandler);
        reader.releaseLock();
    }
};
