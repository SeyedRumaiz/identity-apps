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

import {
    LIVE_CHAT_EVENTS,
    type LiveChatPriorMessage,
    type LiveChatWidgetElement
} from "@wso2/live-chat-widget";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Dispatch } from "redux";
import liveChatConfig from "./live-chat.config.json";
import { getSupportEscalationBaseUrl, liveChatTransport } from "../api/live-chat-transport";
import { setCopilotPanelVisibility } from "../store/actions/copilot";

/** Long enough to read "The engineer ended the chat." before Ask AI returns. */
const RETURN_TO_ASK_AI_DELAY_MS: number = 2500;

let mountedWidget: LiveChatWidgetElement | null = null;

/**
 * Opens the support chat with the Ask AI conversation so far. Returns false
 * when live chat is not configured for this deployment.
 *
 * @param priorMessages - Ask AI turns to share with the engineer.
 * @returns Whether the chat could be opened.
 */
export const openSupportChat = (priorMessages: LiveChatPriorMessage[]): boolean => {
    if (!mountedWidget) {
        return false;
    }
    mountedWidget.open({ priorMessages });

    return true;
};

/**
 * Opens the support chat as it is, for returning to a chat in progress.
 */
export const showSupportChat = (): void => {
    mountedWidget?.open();
};

/**
 * Tracks whether a support chat is in progress (waiting for or talking to an
 * engineer), so Ask AI can offer a way back to it.
 *
 * @returns True while a chat is in progress.
 */
export const useSupportChatInProgress = (): boolean => {
    const [ inProgress, setInProgress ] = useState<boolean>(false);

    useEffect(() => {
        const update = (): void => {
            const phase: string | undefined = mountedWidget?.state.phase;

            setInProgress(phase === "queued" || phase === "connected");
        };

        update();
        document.addEventListener(LIVE_CHAT_EVENTS.started, update);
        document.addEventListener(LIVE_CHAT_EVENTS.resumed, update);
        document.addEventListener(LIVE_CHAT_EVENTS.ended, update);

        return () => {
            document.removeEventListener(LIVE_CHAT_EVENTS.started, update);
            document.removeEventListener(LIVE_CHAT_EVENTS.resumed, update);
            document.removeEventListener(LIVE_CHAT_EVENTS.ended, update);
        };
    }, []);

    return inProgress;
};

/**
 * Mounts the shared wso2-live-chat web component once. Its look lives in
 * live-chat.config.json; this component supplies what JSON cannot hold: the
 * bridge URL from the runtime configuration, the auth transport, and the
 * return to Ask AI when a chat ends.
 *
 * @returns Nothing visible; the web component renders itself.
 */
const SupportChatWidget: FunctionComponent = (): null => {
    const dispatch: Dispatch = useDispatch();

    useEffect(() => {
        const bridgeUrl: string = getSupportEscalationBaseUrl();

        if (!bridgeUrl) {
            return;
        }

        const widget: LiveChatWidgetElement = document.createElement("wso2-live-chat") as LiveChatWidgetElement;

        widget.transport = liveChatTransport;
        widget.config = { ...liveChatConfig, bridgeUrl };
        document.body.appendChild(widget);
        mountedWidget = widget;

        let returnTimer: ReturnType<typeof setTimeout> | undefined;
        const onEnded = (): void => {
            // Only switch back when the customer is looking at the chat.
            if (!widget.state.open) {
                return;
            }
            returnTimer = setTimeout(() => {
                widget.close();
                dispatch(setCopilotPanelVisibility(true));
            }, RETURN_TO_ASK_AI_DELAY_MS);
        };

        widget.addEventListener(LIVE_CHAT_EVENTS.ended, onEnded);

        return () => {
            clearTimeout(returnTimer);
            widget.removeEventListener(LIVE_CHAT_EVENTS.ended, onEnded);
            if (mountedWidget === widget) {
                mountedWidget = null;
            }
            widget.remove();
        };
    }, [ dispatch ]);

    return null;
};

export default SupportChatWidget;
