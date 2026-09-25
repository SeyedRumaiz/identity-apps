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

import { AsgardeoSPAClient } from "@asgardeo/auth-react";
import { AppState, store } from "@wso2is/admin.core.v1/store";
import { LiveChatClient, createLiveChatClient } from "@wso2/live-chat-client";

/**
 * Replaces this feature's previous bespoke console-chat-bridge transport
 * (fetch + hand-rolled SSE parsing in the old support-escalation-api.ts)
 * with \@wso2/live-chat-client (cs-tools/apps/live-chat-sdk/sdk-ts) -- the
 * generic, framework-agnostic client for console-chat-bridge's `/v1/{tenant}/...`
 * API. See that package's own README/doc comments for the
 * transport itself (fetch + ReadableStream SSE, auth header handling,
 * event normalization); this file is only the thin, product-specific glue
 * that supplies the three things the SDK needs from this app (its base
 * URL, this integration's fixed tenant slug, and how to get a bearer
 * token) and nothing else.
 *
 * Auth is the Console SPA's own already-authenticated Asgardeo session --
 * AsgardeoSPAClient.getInstance().getAccessToken() returns the same access
 * token AsgardeoSPAClient's own httpRequest already attaches automatically
 * elsewhere in this app (see copilot-api.ts), just returned as a plain
 * string instead of being injected into an axios request. The SDK itself
 * never imports or knows about AsgardeoSPAClient -- this closure is the
 * only place the two meet.
 */

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
 */
export const getSupportEscalationBaseUrl = (): string => {
    const state: AppState = store.getState();

    return state.config?.endpoints?.supportEscalation ?? "";
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
        getAccessToken: (): Promise<string> => AsgardeoSPAClient.getInstance().getAccessToken(),
        tenant: LIVE_CHAT_TENANT
    });
    cachedForBaseUrl = baseUrl;

    return cachedClient;
};
