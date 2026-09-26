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
 * Replaces this feature's previous bespoke console-chat-bridge transport
 * (fetch + hand-rolled SSE parsing in the old support-escalation-api.ts)
 * with \@wso2/live-chat-client (cs-tools/apps/live-chat-sdk/sdk-ts) -- the
 * generic, framework-agnostic client for console-chat-bridge's `/v1/{tenant}/...`
 * API. See that package's own README/doc comments for the transport
 * itself (auth header handling, event normalization); this file supplies
 * the product-specific glue the SDK needs from this app (its base URL,
 * this integration's fixed tenant slug, and how to make an authenticated
 * request) and nothing else.
 *
 * Auth is the Console SPA's own already-authenticated Asgardeo session --
 * but this deployment's Asgardeo storage mode is "webWorker" (see
 * deployment.config.json's oidc.storage), which by design never exposes a
 * raw access-token string to main-thread code (see
 * AsgardeoSPAClient.getAccessToken's own doc comment: "This method will
 * not return the access token if the storage type is set to webWorker").
 * The SDK's default transport needs exactly that raw string to build its
 * own fetch() Authorization header, so it cannot be used as-is here.
 * Instead this file wires the SDK's requestTransport/streamTransport
 * escape hatches (see types.ts) to AsgardeoSPAClient.httpRequest/
 * httpStreamRequest -- the same webWorker-aware, token-attaching client
 * copilot-api.ts already uses successfully elsewhere in this app. The SDK
 * itself never imports or knows about AsgardeoSPAClient -- this file is
 * the only place the two meet.
 */

/**
 * True for the shape axios gives a rejected promise when the server did
 * respond, just with a non-2xx status (as opposed to a genuine transport
 * failure, which has no `response`). Duck-typed rather than an `instanceof
 * AxiosError` check: under webWorker storage, AsgardeoSPAClient's worker
 * relays the rejection back to this thread via postMessage/structured
 * clone, which does not preserve the AxiosError class (or any class) --
 * only its own enumerable data survives.
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
 * Adapts AsgardeoSPAClient.getInstance().httpRequest to
 * LiveChatRequestTransport -- see that interface's own doc comment
 * (@wso2/live-chat-client's types.ts).
 *
 * Deliberately does NOT pass `validateStatus`/`transformResponse` (axios's
 * usual way to stop it rejecting on a non-2xx status, and to keep a JSON
 * body as a raw string respectively) -- under webWorker storage, this
 * config object is sent to AsgardeoSPAClient's worker via
 * `Worker.postMessage`, which uses the structured clone algorithm and
 * cannot clone a function at all (fails outright with a DataCloneError,
 * not a silently-ignored option). So a non-2xx response instead surfaces
 * as a rejected promise (standard axios behavior), caught below and
 * unpacked via hasHttpResponse -- the SDK itself turns that
 * status/body pair into a LiveChatError, so this adapter resolves with it
 * rather than rethrowing. And since transformResponse can't be passed
 * either, a JSON response may arrive already parsed into an object; the
 * `text` line below re-stringifies that case, since the SDK does its own
 * JSON.parse and expects a raw string either way.
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
 * Adapts AsgardeoSPAClient.getInstance().httpStreamRequest to
 * LiveChatStreamTransport -- see that interface's own doc comment. Mirrors
 * copilot-api.ts's own sendCopilotChatMessage, the proven pattern for an
 * authenticated SSE-style stream under webWorker storage in this app.
 * Cancellation: this SDK's own subscribe()/unsubscribe() calls
 * reader.cancel() on a reader obtained from the stream this returns --
 * per the standard ReadableStream contract that propagates to the
 * underlying connection regardless of which getReader() call produced the
 * reader, so no separate signal wiring is needed here.
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

/**
 * console-chat-bridge tenant slug this integration always escalates
 * through -- see that service's internal/tenant package and this
 * deployment's own TENANT_REGISTRY / legacy-fallback configuration on the
 * bridge side. Fixed, not derived from anything client-side.
 */
const LIVE_CHAT_TENANT: string = "identity-console";

/**
 * Returns console-chat-bridge's configured base URL, or "" if this
 * deployment hasn't set one up (see app.ts's own doc comment on
 * DeploymentConfigInterface.extensions.consoleChatBridgeBaseUrl) --
 * callers treat an empty value as "this feature isn't available here" and
 * do not attempt any escalation call.
 *
 * A path-only value (e.g. "/console-chat-bridge", this deployment's own
 * same-origin vite dev-proxy route -- see vite.config.ts's own doc comment
 * on why that proxy exists) is resolved to an absolute URL against the
 * current origin. This matters specifically because requestTransport/
 * streamTransport route through AsgardeoSPAClient's webWorker, whose own
 * script executes from a `blob:` URL with no meaningful base to resolve a
 * relative path against -- its internal XMLHttpRequest.open() rejects one
 * outright with "Invalid URL", even though the exact same relative path
 * resolves fine against window.location for a plain main-thread fetch().
 * An already-absolute configured value (a real deployment's own
 * cross-origin console-chat-bridge, with its own TLS) passes through
 * unchanged.
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
 * Returns a LiveChatClient bound to this deployment's console-chat-bridge
 * base URL and the fixed identity-console tenant, or null when this
 * deployment hasn't configured one (see getSupportEscalationBaseUrl) --
 * callers must treat null exactly as they previously treated an empty
 * getSupportEscalationBaseUrl() result.
 *
 * Memoized per base URL rather than constructed fresh on every call:
 * createLiveChatClient itself is cheap/stateless, but this avoids
 * rebuilding it on every keystroke/render path that might call this.
 * There is no meaningful "close" for a LiveChatClient -- it holds no
 * connection of its own outside of whatever subscribe() call is currently
 * active, which callers already manage themselves (see
 * store/actions/copilot.ts's requestManager).
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
