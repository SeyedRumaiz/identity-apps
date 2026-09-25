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

import { AppState } from "@wso2is/admin.core.v1/store";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AnyAction } from "redux";
import { ThunkDispatch } from "redux-thunk";
import {
    addCopilotMessage,
    clearCopilotChatWithApi,
    escalateToEngineer,
    fetchCopilotHistory,
    loadMoreCopilotHistory,
    sendCopilotMessage,
    sendEngineerMessage,
    setCopilotContentType,
    setCopilotPanelLoading,
    setCopilotPanelVisibility,
    toggleCopilotPanel
} from "../store/actions/copilot";
import {
    CopilotContentType,
    CopilotMessageInterface,
    CopilotPanelStateInterface,
    EscalationStatus
} from "../store/types/copilot-action-types";

type AppDispatch = ThunkDispatch<AppState, unknown, AnyAction>;

/**
 * Interface for the copilot panel hook return value.
 */
interface UseCopilotPanelInterface {
    /**
     * Whether the copilot panel is visible.
     */
    isVisible: boolean;
    /**
     * Whether the copilot panel is loading.
     */
    isLoading: boolean;
    /**
     * The chat messages.
     */
    messages: CopilotMessageInterface[];
    /**
     * The current content type.
     */
    contentType: CopilotContentType;
    /**
     * Whether there are older history records available to load.
     */
    hasMoreHistory: boolean;
    /**
     * Whether a "load earlier" history request is in progress.
     */
    isLoadingMoreHistory: boolean;
    /**
     * Function to show the copilot panel.
     */
    showPanel: () => void;
    /**
     * Function to hide the copilot panel.
     */
    hidePanel: () => void;
    /**
     * Function to toggle the copilot panel.
     */
    togglePanel: () => void;
    /**
     * Function to send a message to the copilot.
     */
    sendMessage: (message: string) => void;
    /**
     * Function to add a message to the chat.
     */
    addMessage: (message: CopilotMessageInterface) => void;
    /**
     * Function to clear the chat history.
     */
    clearChat: () => Promise<void>;
    /**
     * Function to set the content type.
     */
    setContentType: (contentType: CopilotContentType) => void;
    /**
     * Function to set the loading state.
     */
    setLoading: (isLoading: boolean) => void;
    /**
     * Function to load chat history.
     */
    loadHistory: () => void;
    /**
     * Function to load the next (older) page of history and prepend it.
     * Resolves to true if messages were actually prepended, false otherwise.
     */
    loadMoreHistory: () => Promise<boolean>;
    /**
     * The current status message (agent step progress), or null.
     */
    statusMessage: string | null;
    /**
     * Status of the current "Chat with an Engineer" escalation, if any.
     */
    escalationStatus: EscalationStatus;
    /**
     * Function to escalate an Ask AI error (by that error message's id) to a live engineer.
     */
    escalateToEngineer: (errorMessageId: string) => void;
}

/**
 * Hook to manage the copilot panel state and actions.
 * Authentication is handled automatically by AsgardeoSPAClient in the API layer.
 *
 * @returns The copilot panel state and actions.
 */
const useCopilotPanel = (): UseCopilotPanelInterface => {
    const dispatch: AppDispatch = useDispatch<AppDispatch>();
    const copilotState: CopilotPanelStateInterface = useSelector((state: AppState) => state.copilot);

    const showPanel: () => void = useCallback(() => {
        dispatch(setCopilotPanelVisibility(true));
    }, [ dispatch ]);

    const hidePanel: () => void = useCallback(() => {
        dispatch(setCopilotPanelVisibility(false));
    }, [ dispatch ]);

    const togglePanel: () => void = useCallback(() => {
        dispatch(toggleCopilotPanel());
    }, [ dispatch ]);

    /**
     * Send a message. Routes to the connected engineer once an escalation
     * has been accepted (copilotState.escalation.status === CONNECTED),
     * otherwise goes to Ask AI as before -- callers (copilot-chat.tsx) do
     * not need to know which is currently active.
     * Token handling is done automatically by AsgardeoSPAClient in either
     * case.
     */
    const sendMessage: (message: string) => void = useCallback((message: string) => {
        if (copilotState?.escalation?.status === EscalationStatus.CONNECTED) {
            dispatch(sendEngineerMessage(message));
        } else {
            dispatch(sendCopilotMessage(message));
        }
    }, [ dispatch, copilotState?.escalation?.status ]);

    /**
     * Escalate an Ask AI error to a live engineer.
     */
    const escalateToEngineerCallback: (errorMessageId: string) => void = useCallback(
        (errorMessageId: string) => {
            dispatch(escalateToEngineer(errorMessageId));
        }, [ dispatch ]
    );

    const addMessage: (message: CopilotMessageInterface) => void = useCallback((message: CopilotMessageInterface) => {
        dispatch(addCopilotMessage(message));
    }, [ dispatch ]);

    /**
     * Clear the chat history.
     * Token handling is done automatically by AsgardeoSPAClient.
     */
    const clearChat: () => Promise<void> = useCallback(async () => {
        await dispatch(clearCopilotChatWithApi());
    }, [ dispatch ]);

    const setContentType: (contentType: CopilotContentType) => void = useCallback((contentType: CopilotContentType) => {
        dispatch(setCopilotContentType(contentType));
    }, [ dispatch ]);

    const setLoading: (isLoading: boolean) => void = useCallback((isLoading: boolean) => {
        dispatch(setCopilotPanelLoading(isLoading));
    }, [ dispatch ]);

    const loadHistory: () => void = useCallback(() => {
        dispatch(fetchCopilotHistory());
    }, [ dispatch ]);

    const loadMoreHistory: () => Promise<boolean> = useCallback((): Promise<boolean> => {
        return dispatch(loadMoreCopilotHistory());
    }, [ dispatch ]);

    return {
        addMessage,
        clearChat,
        contentType: copilotState?.contentType ?? CopilotContentType.CHAT,
        escalateToEngineer: escalateToEngineerCallback,
        escalationStatus: copilotState?.escalation?.status ?? EscalationStatus.IDLE,
        hasMoreHistory: copilotState?.hasMoreHistory ?? false,
        hidePanel,
        isLoading: copilotState?.isLoading ?? false,
        isLoadingMoreHistory: copilotState?.isLoadingMoreHistory ?? false,
        isVisible: copilotState?.isVisible ?? false,
        loadHistory,
        loadMoreHistory,
        messages: copilotState?.messages ?? [],
        sendMessage,
        setContentType,
        setLoading,
        showPanel,
        statusMessage: copilotState?.statusMessage ?? null,
        togglePanel
    };
};

export default useCopilotPanel;
