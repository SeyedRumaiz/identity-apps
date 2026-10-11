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
import { LIVE_CHAT_EVENTS, type LiveChatWidgetElement } from "@wso2/live-chat-widget";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import liveChatConfig from "./live-chat.config.json";
import { getSupportEscalationBaseUrl, liveChatTransport } from "../api/live-chat-transport";

let mountedWidget: LiveChatWidgetElement | null = null;

/**
 * The header's AI button: whether the support assistant panel is open, and
 * a toggle for it. The panel replaces the Ask AI drawer for now.
 *
 * @returns The panel's open state and a toggle.
 */
export const useSupportChatPanel = (): { isOpen: boolean; toggle: () => void } => {
    const [ isOpen, setIsOpen ] = useState<boolean>(mountedWidget?.state.open ?? false);

    useEffect(() => {
        const onOpen = (): void => setIsOpen(true);
        const onClose = (): void => setIsOpen(false);

        document.addEventListener(LIVE_CHAT_EVENTS.open, onOpen);
        document.addEventListener(LIVE_CHAT_EVENTS.close, onClose);

        return () => {
            document.removeEventListener(LIVE_CHAT_EVENTS.open, onOpen);
            document.removeEventListener(LIVE_CHAT_EVENTS.close, onClose);
        };
    }, []);

    const toggle: () => void = useCallback(() => {
        mountedWidget?.toggle();
    }, []);

    return { isOpen, toggle };
};

/**
 * Mounts the shared wso2-live-chat web component once: the AI assistant
 * first, then a support engineer in the same panel. Its look lives in
 * live-chat.config.json; this component supplies what JSON cannot hold: the
 * bridge URL from the runtime configuration and the auth transport.
 *
 * @returns Nothing visible; the web component renders itself.
 */
const SupportChatWidget: FunctionComponent = (): null => {
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

        return () => {
            if (mountedWidget === widget) {
                mountedWidget = null;
            }
            widget.remove();
        };
    }, []);

    return null;
};

export default SupportChatWidget;
