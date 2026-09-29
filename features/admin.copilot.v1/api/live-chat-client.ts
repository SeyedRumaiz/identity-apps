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

import { AsgardeoSPAClient, HttpResponse } from "@asgardeo/auth-react";
import { AppState, store } from "@wso2is/admin.core.v1/store";
import {
    LiveChatClient,
    LiveChatRequestTransport,
    LiveChatStreamTransport,
    createLiveChatClient
} from "@wso2/live-chat-client";

/**
 * Product-specific glue between @wso2/live-chat-client and this app's auth.
 *
 * This deployment's Asgardeo storage mode is "webWorker", which never
 * exposes a raw access-token string to main-thread code -- so the SDK's
 * default fetch()-based transport, which needs that string to build its
 * Authorization header, cannot be used here. Instead this file implements
 * the SDK's requestTransport/streamTransport interfaces on top of
 * AsgardeoSPAClient.httpRequest/httpStreamRequest, which attach the token
 * inside the worker itself. The SDK never imports or knows about
 * AsgardeoSPAClient -- this file is the only place the two meet.
 */

/**
 * True when a rejected httpRequest promise carries a real HTTP response
 * (non-2xx status) rather than a transport-level failure. Duck-typed, not
 * `instanceof AxiosError`: the worker relays rejections back via
 * postMessage/structured clone, which drops the error's class.
 */
function hasHttpResponse(err: unknown): err is { response: HttpResponse } {
    return (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: unknown }).response === "object" &&
        (err as { response: { status?: unknown } }).response !== null &&
        typeof (err as { response: { status?: unknown } }).response.status === "number"
    );
}

/**
 * Adapts AsgardeoSPAClient's httpRequest to LiveChatRequestTransport.
 *
 * Deliberately omits axios's `validateStatus`/`transformResponse` options:
 * both are functions, and the config here is sent to the auth worker via
 * `postMessage`, whose structured-clone algorithm cannot serialize a
 * function at all (throws DataCloneError). A non-2xx response therefore
 * surfaces as a rejected promise instead, unpacked below via
 * hasHttpResponse. Without transformResponse, a JSON body may also arrive
 * already parsed into an object rather than a raw string -- re-stringified
 * here since the SDK does its own JSON.parse either way.
 */
const requestTransport: LiveChatRequestTransport = {
    postJson: async (url: string, body: unknown): Promise<{ status: number; text: string }> => {
        let response: HttpResponse | undefined;

        try {
            response = await AsgardeoSPAClient.getInstance().httpRequest({
                data: body,
                headers: { "Content-Type": "application/json" },
                method: "POST",
                url
            });
        } catch (err: unknown) {
            if (hasHttpResponse(err)) {
                response = err.response;
            } else {
                throw err;
            }
        }

        if (!response) {
            throw new Error("No response returned from httpRequest.");
        }

        const text: string = typeof response.data === "string" ? response.data : JSON.stringify(response.data ?? "");

        return { status: response.status, text };
    }
};

/**
 * Adapts AsgardeoSPAClient's httpStreamRequest to LiveChatStreamTransport.
 * No separate cancellation wiring needed: the SDK's own unsubscribe()
 * calls reader.cancel() on a reader it gets from this stream, which
 * propagates to the underlying connection per the standard ReadableStream
 * contract.
 */
const streamTransport: LiveChatStreamTransport = {
    openStream: async (url: string): Promise<ReadableStream<Uint8Array>> => {
        const stream: ReadableStream<Uint8Array> | undefined = await AsgardeoSPAClient.getInstance().httpStreamRequest({
            headers: { Accept: "text/event-stream" },
            method: "GET",
            url
        });

        if (!stream) {
            throw new Error("No stream returned — httpStreamRequest requires WebWorker storage.");
        }

        return stream;
    }
};

/** console-chat-bridge tenant slug this integration always escalates through. */
const LIVE_CHAT_TENANT: string = "identity-console";

/**
 * console-chat-bridge's configured base URL, or "" if this deployment
 * hasn't set one up -- callers treat an empty value as "unavailable here".
 *
 * A path-only value is resolved to an absolute URL against the current
 * origin, because requestTransport/streamTransport run inside
 * AsgardeoSPAClient's auth worker, which executes from a `blob:` URL with
 * no origin to resolve a relative path against (its XMLHttpRequest.open()
 * rejects one with "Invalid URL"). An already-absolute value passes
 * through unchanged.
 */
export const getSupportEscalationBaseUrl = (): string => {
    const state: AppState = store.getState();
    const configured: string = state.config?.endpoints?.supportEscalation ?? "";

    if (!configured || !configured.startsWith("/")) {
        return configured;
    }

    return `${window.location.origin}${configured}`;
};

let cachedClient: LiveChatClient | null = null;
let cachedForBaseUrl: string | null = null;

/**
 * A LiveChatClient bound to this deployment's console-chat-bridge base URL
 * and the fixed identity-console tenant, or null if unconfigured.
 * Memoized per base URL to avoid rebuilding on every call.
 * Hands back an SDK client pre-wired with requestTransport/streamTransport
 * built on AsgardeoSPAClient.
 */
export const getLiveChatClient = (): LiveChatClient | null => {
    const baseUrl: string = getSupportEscalationBaseUrl();

    if (!baseUrl) {
        return null;
    }
    if (cachedClient && cachedForBaseUrl === baseUrl) {
        return cachedClient;
    }

    cachedClient = createLiveChatClient({
        baseUrl,
        requestTransport,
        streamTransport,
        tenant: LIVE_CHAT_TENANT
    });
    cachedForBaseUrl = baseUrl;

    return cachedClient;
};
