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

/**
 * Enum for copilot action types.
 */
export enum CopilotActionTypes {
    /**
     * Action type to set the copilot panel visibility.
     */
    SET_COPILOT_PANEL_VISIBILITY = "SET_COPILOT_PANEL_VISIBILITY",
    /**
     * Action type to toggle the copilot panel.
     */
    TOGGLE_COPILOT_PANEL = "TOGGLE_COPILOT_PANEL",
    /**
     * Action type to set copilot panel loading state.
     */
    SET_COPILOT_PANEL_LOADING = "SET_COPILOT_PANEL_LOADING",
    /**
     * Action type to add a message to copilot chat.
     */
    ADD_COPILOT_MESSAGE = "ADD_COPILOT_MESSAGE",
    /**
     * Action type to update a message in copilot chat.
     */
    UPDATE_COPILOT_MESSAGE = "UPDATE_COPILOT_MESSAGE",
    /**
     * Action type to clear copilot chat history.
     */
    CLEAR_COPILOT_CHAT = "CLEAR_COPILOT_CHAT",
    /**
     * Action type to set copilot panel content type.
     */
    SET_COPILOT_CONTENT_TYPE = "SET_COPILOT_CONTENT_TYPE",
    /**
     * Action type to set copilot chat history.
     */
    SET_COPILOT_CHAT_HISTORY = "SET_COPILOT_CHAT_HISTORY",
    /**
     * Action type to set copilot status message (agent step progress).
     */
    SET_COPILOT_STATUS_MESSAGE = "SET_COPILOT_STATUS_MESSAGE",
    /**
     * Action type to set history pagination metadata.
     */
    SET_COPILOT_HISTORY_PAGINATION = "SET_COPILOT_HISTORY_PAGINATION",
    /**
     * Action type to prepend older messages to the chat (load-earlier).
     */
    PREPEND_COPILOT_MESSAGES = "PREPEND_COPILOT_MESSAGES",
    /**
     * Action type to set the isLoadingMoreHistory flag independently of pagination metadata.
     */
    SET_IS_LOADING_MORE_HISTORY = "SET_IS_LOADING_MORE_HISTORY",
    /**
     * Action type to set Ask AI's stable per-panel-session context id.
     */
    SET_ASK_AI_CONTEXT_ID = "SET_ASK_AI_CONTEXT_ID",
    /**
     * Action type to update "Chat with an Engineer" escalation state.
     */
    SET_ESCALATION_STATE = "SET_ESCALATION_STATE"
}

/**
 * Copilot message interface.
 */
export interface CopilotMessageInterface {
    id: string;
    content: string;
    // "engineer" is a live human reply after a "Chat with an Engineer"
    // escalation is accepted (see EscalationStatus.CONNECTED) -- never
    // produced by Ask AI itself.
    sender: "user" | "copilot" | "engineer";
    timestamp: number;
    type?: "text" | "code" | "error" | "streaming";
    suggestions?: string[];
    /** True while the backend is generating suggestions — used to show skeleton placeholders. */
    suggestionsLoading?: boolean;
}

/**
 * Copilot content types.
 */
export enum CopilotContentType {
    CHAT = "chat",
    HELP = "help",
    DOCUMENTATION = "documentation"
}

/**
 * Status of a "Chat with an Engineer" escalation raised from an Ask AI
 * error -- see console-chat-bridge's own README for the backend side of
 * this flow. caseId/liveChatId (EscalationStateInterface.caseId) is always
 * a fresh id minted by that bridge, NEVER CopilotPanelStateInterface's own
 * askAiContextId -- see that field's doc comment for why these two
 * identities must stay distinct.
 */
export enum EscalationStatus {
    /** No escalation in progress -- the "Chat with an Engineer" button may be shown on an error. */
    IDLE = "idle",
    /** POST /support/chats is in flight. */
    ESCALATING = "escalating",
    /** Escalated; waiting for chat-routing-service to assign an engineer. */
    QUEUED = "queued",
    /** An engineer accepted; the chat input now sends engineer messages. */
    CONNECTED = "connected",
    /** The engineer ended the session, or it was converted to a case. */
    ENDED = "ended",
    /** The escalation attempt itself failed (e.g. bridge unreachable). */
    ERROR = "error"
}

/**
 * State of the current (at most one) live-engineer-chat escalation.
 */
export interface EscalationStateInterface {
    status: EscalationStatus;
    caseId: string | null;
    engineerEmail: string | null;
}

/**
 * Copilot panel state interface.
 */
export interface CopilotPanelStateInterface {
    isVisible: boolean;
    isLoading: boolean;
    messages: CopilotMessageInterface[];
    contentType: CopilotContentType;
    statusMessage: string | null;
    /** Whether there are older history records available to load. */
    hasMoreHistory: boolean;
    /** Current reverse-offset used for the next "load earlier" request. */
    historyOffset: number;
    /** Total number of history records stored for the user. */
    historyTotal: number;
    /** Whether a "load earlier" request is in progress. */
    isLoadingMoreHistory: boolean;
    /**
     * Ask AI's stable per-panel-session context id, generated client-side
     * (crypto.randomUUID()) the first time it's needed -- Ask AI's own SSE
     * responses don't reliably return one (see copilot-api.ts's
     * CopilotChatResponse.conversationId, currently unused). Sent to
     * console-chat-bridge as an escalation's conversationId. Reset on
     * CLEAR_COPILOT_CHAT so a cleared chat starts a fresh context.
     */
    askAiContextId: string | null;
    /** State of the current (at most one) "Chat with an Engineer" escalation. */
    escalation: EscalationStateInterface;
}

/**
 * Set copilot panel visibility action interface.
 */
export interface SetCopilotPanelVisibilityActionInterface {
    payload: boolean;
    type: CopilotActionTypes.SET_COPILOT_PANEL_VISIBILITY;
}

/**
 * Toggle copilot panel action interface.
 */
export interface ToggleCopilotPanelActionInterface {
    type: CopilotActionTypes.TOGGLE_COPILOT_PANEL;
}

/**
 * Set copilot panel loading action interface.
 */
export interface SetCopilotPanelLoadingActionInterface {
    payload: boolean;
    type: CopilotActionTypes.SET_COPILOT_PANEL_LOADING;
}

/**
 * Add copilot message action interface.
 */
export interface AddCopilotMessageActionInterface {
    payload: CopilotMessageInterface;
    type: CopilotActionTypes.ADD_COPILOT_MESSAGE;
}

/**
 * Update copilot message action interface.
 */
export interface UpdateCopilotMessageActionInterface {
    payload: {
        id: string;
        content: string;
        type?: CopilotMessageInterface["type"];
        suggestions?: string[];
        suggestionsLoading?: boolean;
    };
    type: CopilotActionTypes.UPDATE_COPILOT_MESSAGE;
}

/**
 * Clear copilot chat action interface.
 */
export interface ClearCopilotChatActionInterface {
    type: CopilotActionTypes.CLEAR_COPILOT_CHAT;
}

/**
 * Set copilot content type action interface.
 */
export interface SetCopilotContentTypeActionInterface {
    payload: CopilotContentType;
    type: CopilotActionTypes.SET_COPILOT_CONTENT_TYPE;
}

/**
 * Set copilot chat history action interface.
 */
export interface SetCopilotChatHistoryActionInterface {
    payload: CopilotMessageInterface[];
    type: CopilotActionTypes.SET_COPILOT_CHAT_HISTORY;
}

/**
 * Set copilot status message action interface.
 */
export interface SetCopilotStatusMessageActionInterface {
    payload: string | null;
    type: CopilotActionTypes.SET_COPILOT_STATUS_MESSAGE;
}

/**
 * History pagination metadata payload.
 */
export interface HistoryPaginationPayloadInterface {
    hasMoreHistory: boolean;
    /** Next offset to use for loading earlier messages. */
    nextOffset: number;
    total: number;
}

/**
 * Set history pagination state action interface.
 */
export interface SetCopilotHistoryPaginationActionInterface {
    payload: HistoryPaginationPayloadInterface;
    type: CopilotActionTypes.SET_COPILOT_HISTORY_PAGINATION;
}

/**
 * Prepend older messages action interface (used when loading earlier history).
 */
export interface PrependCopilotMessagesActionInterface {
    payload: CopilotMessageInterface[];
    type: CopilotActionTypes.PREPEND_COPILOT_MESSAGES;
}

/**
 * Set isLoadingMoreHistory flag action interface.
 */
export interface SetIsLoadingMoreHistoryActionInterface {
    payload: boolean;
    type: CopilotActionTypes.SET_IS_LOADING_MORE_HISTORY;
}

/**
 * Set Ask AI context id action interface.
 */
export interface SetAskAiContextIdActionInterface {
    payload: string;
    type: CopilotActionTypes.SET_ASK_AI_CONTEXT_ID;
}

/**
 * Set escalation state action interface. Partial payload: only provided
 * fields are merged into the existing EscalationStateInterface.
 */
export interface SetEscalationStateActionInterface {
    payload: Partial<EscalationStateInterface>;
    type: CopilotActionTypes.SET_ESCALATION_STATE;
}

/**
 * Export action interfaces.
 */
export type CopilotActions = SetCopilotPanelVisibilityActionInterface
    | ToggleCopilotPanelActionInterface
    | SetCopilotPanelLoadingActionInterface
    | AddCopilotMessageActionInterface
    | UpdateCopilotMessageActionInterface
    | ClearCopilotChatActionInterface
    | SetCopilotContentTypeActionInterface
    | SetCopilotChatHistoryActionInterface
    | SetCopilotStatusMessageActionInterface
    | SetCopilotHistoryPaginationActionInterface
    | PrependCopilotMessagesActionInterface
    | SetIsLoadingMoreHistoryActionInterface
    | SetAskAiContextIdActionInterface
    | SetEscalationStateActionInterface;
