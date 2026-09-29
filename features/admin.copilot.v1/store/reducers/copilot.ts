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

import { Reducer } from "redux";
import {
    CopilotActionTypes,
    CopilotActions,
    CopilotContentType,
    CopilotMessageInterface,
    CopilotPanelStateInterface,
    EscalationStateInterface,
    EscalationStatus
} from "../types/copilot-action-types";

/**
 * Session-storage key an in-progress "Chat with an Engineer" escalation is
 * mirrored under, keyed by tab (not shared across tabs, unlike
 * localStorage) so a page refresh doesn't wipe Redux's own in-memory
 * escalation state out from under a session chat-routing-service still
 * considers live -- without this, a refresh left the panel showing IDLE
 * while the server still had an ACTIVE/ACCEPTED case for that customer,
 * so the next "Chat with an Engineer" click was rejected server-side
 * ("you already have a live chat in progress") with no way back into the
 * chat that message was referring to. See resumeEngineerChatIfNeeded in
 * store/actions/copilot.ts for the other half: restoring this value alone
 * doesn't re-open the SSE subscription, that thunk does.
 */
const ENGINEER_ESCALATION_STORAGE_KEY: string = "wso2is.copilot.engineerEscalation";

const defaultEscalationState: EscalationStateInterface = {
    caseId: null,
    engineerEmail: null,
    status: EscalationStatus.IDLE
};

/** Reads a persisted escalation back out of sessionStorage, falling back to
 * the default IDLE state on first load, a cleared storage, or anything
 * that fails to parse (a schema change between reloads, private-browsing
 * storage that silently no-ops, etc.). */
const loadPersistedEscalation = (): EscalationStateInterface => {
    try {
        const raw: string | null = sessionStorage.getItem(ENGINEER_ESCALATION_STORAGE_KEY);

        if (!raw) {
            return defaultEscalationState;
        }

        const parsed: Partial<EscalationStateInterface> = JSON.parse(raw);

        if (!parsed?.caseId || !parsed?.status) {
            return defaultEscalationState;
        }

        return {
            caseId: parsed.caseId,
            engineerEmail: parsed.engineerEmail ?? null,
            status: parsed.status
        };
    } catch {
        return defaultEscalationState;
    }
};

/** Mirrors escalation into sessionStorage so a refresh can restore it --
 * only while there is something worth resuming (ESCALATING/QUEUED/
 * CONNECTED with a real caseId); IDLE/ENDED/ERROR clear it, since there is
 * nothing left on the server for a resume to attach to. */
const persistEscalation = (escalation: EscalationStateInterface): void => {
    try {
        const isResumable: boolean = Boolean(escalation.caseId) && (
            escalation.status === EscalationStatus.ESCALATING ||
            escalation.status === EscalationStatus.QUEUED ||
            escalation.status === EscalationStatus.CONNECTED
        );

        if (isResumable) {
            sessionStorage.setItem(ENGINEER_ESCALATION_STORAGE_KEY, JSON.stringify(escalation));
        } else {
            sessionStorage.removeItem(ENGINEER_ESCALATION_STORAGE_KEY);
        }
    } catch {
        // Best-effort only -- a refresh simply won't resume this time.
    }
};

/**
 * Initial state for the copilot reducer.
 */
const initialEscalationState: EscalationStateInterface = loadPersistedEscalation();

const initialState: CopilotPanelStateInterface = {
    askAiContextId: null,
    contentType: CopilotContentType.CHAT,
    escalation: initialEscalationState,
    hasMoreHistory: false,
    historyOffset: 0,
    historyTotal: 0,
    isLoading: true,
    isLoadingMoreHistory: false,
    isVisible: false,
    messages: [],
    statusMessage: null
};

/**
 * Copilot reducer.
 *
 * @param state - Previous state of copilot.
 * @param action - Action type.
 * @returns The new state.
 */
export const copilotReducer: Reducer<CopilotPanelStateInterface> = (
    state: CopilotPanelStateInterface = initialState,
    action: CopilotActions
): CopilotPanelStateInterface => {
    switch (action.type) {
        case CopilotActionTypes.SET_COPILOT_PANEL_VISIBILITY:
            return {
                ...state,
                isVisible: action.payload
                // Note: Keep isLoading state when panel is hidden/shown
                // This ensures "thinking" indicator persists when panel is reopened
            };
        case CopilotActionTypes.TOGGLE_COPILOT_PANEL:
            return {
                ...state,
                isVisible: !state.isVisible
            };
        case CopilotActionTypes.SET_COPILOT_PANEL_LOADING:
            return {
                ...state,
                isLoading: action.payload
            };
        case CopilotActionTypes.ADD_COPILOT_MESSAGE:
            return {
                ...state,
                messages: [ ...state.messages, action.payload ]
            };
        case CopilotActionTypes.UPDATE_COPILOT_MESSAGE:
            return {
                ...state,
                messages: state.messages.map((message: CopilotMessageInterface) =>
                    message.id === action.payload.id
                        ? {
                            ...message,
                            content: typeof action.payload.content === "string"
                                ? message.content + action.payload.content
                                : message.content,
                            type: action.payload.type ?? message.type,
                            ...(action.payload.suggestions !== undefined && {
                                suggestions: action.payload.suggestions,
                                suggestionsLoading: false
                            }),
                            ...(action.payload.suggestionsLoading !== undefined &&
                                action.payload.suggestions === undefined && {
                                suggestionsLoading: action.payload.suggestionsLoading
                            })
                        }
                        : message
                )
            };
        case CopilotActionTypes.CLEAR_COPILOT_CHAT:
            persistEscalation(defaultEscalationState);

            return {
                ...state,
                // A cleared chat starts a fresh Ask AI context and drops any
                // escalation state -- there is nothing left on screen for an
                // in-progress escalation to attach to.
                askAiContextId: null,
                escalation: defaultEscalationState,
                hasMoreHistory: false,
                historyOffset: 0,
                historyTotal: 0,
                isLoading: false,
                isLoadingMoreHistory: false,
                messages: [],
                statusMessage: null
            };
        case CopilotActionTypes.SET_COPILOT_CONTENT_TYPE:
            return {
                ...state,
                contentType: action.payload
            };
        case CopilotActionTypes.SET_COPILOT_CHAT_HISTORY:
            return {
                ...state,
                messages: action.payload
            };
        case CopilotActionTypes.SET_COPILOT_STATUS_MESSAGE:
            return {
                ...state,
                statusMessage: action.payload
            };
        case CopilotActionTypes.SET_COPILOT_HISTORY_PAGINATION:
            return {
                ...state,
                hasMoreHistory: action.payload.hasMoreHistory,
                historyOffset: action.payload.nextOffset,
                historyTotal: action.payload.total,
                isLoadingMoreHistory: false
            };
        case CopilotActionTypes.PREPEND_COPILOT_MESSAGES:
            return {
                ...state,
                messages: [ ...action.payload, ...state.messages ]
            };
        case CopilotActionTypes.SET_IS_LOADING_MORE_HISTORY:
            return {
                ...state,
                isLoadingMoreHistory: action.payload
            };
        case CopilotActionTypes.SET_ASK_AI_CONTEXT_ID:
            return {
                ...state,
                askAiContextId: action.payload
            };
        case CopilotActionTypes.SET_ESCALATION_STATE: {
            const nextEscalation: EscalationStateInterface = {
                ...state.escalation,
                ...action.payload
            };

            persistEscalation(nextEscalation);

            return {
                ...state,
                escalation: nextEscalation
            };
        }
        default:
            return state;
    }
};
