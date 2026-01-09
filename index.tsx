/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, SelectedChannelStore, UserStore } from "@webpack/common";

import { RTCConnectionVideoEventArgs, StreamStartEventArgs } from "./types";

const disableStreamPreviews = getUserSettingLazy<boolean>("voiceAndVideo", "disableStreamPreviews")!;
const ChannelTypes = findLazy(m => m.ANNOUNCEMENT_THREAD === 10);
const { setGoLiveSource } = findByPropsLazy("setGoLiveSource");

let streamId: number;

const settings = definePluginSettings({
    sourceId: {
        type: OptionType.STRING,
        description: "The ID of the video source to use for streaming",
    },
    audioSourceId: {
        type: OptionType.STRING,
        description: "The ID of the audio source to use for streaming",
    },
    sound: {
        type: OptionType.BOOLEAN,
        description: "Whether to include sound in the stream",
        default: true
    }
});

export default definePlugin({
    name: "streamUtilities",
    description: "A set of utilities for managing and enhancing streaming functionality",
    authors: [/* Devs.Zorian*/],

    settings,

    start: () => {
        setGoLiveSource({
            "qualityOptions": {
                "preset": 3,
                "resolution": 1080,
                "frameRate": 30
            },
            "context": "stream"
        });

        document.addEventListener("keydown", e => {
            if (e.code !== "KeyS" || !e.ctrlKey || !e.shiftKey || e.altKey || streamId) return;

            startStream();
        });
    },

    flux: {
        RTC_CONNECTION_VIDEO: (e: RTCConnectionVideoEventArgs) => {
            const myId = UserStore.getCurrentUser().id;

            if (e.context !== "stream" || e.userId !== myId) return;

            streamId = e.streamId;
        },
        STREAM_START: (e: StreamStartEventArgs) => {
            saveStreamSettings(e);
        }
    }
});

async function startStream() {
    const channelId = SelectedChannelStore.getChannelId();
    const { sourceId, audioSourceId } = settings.store;

    if (!channelId || !sourceId) return;

    const channel = ChannelStore.getChannel(channelId);
    const isCall = channel.type === ChannelTypes.DM;

    await FluxDispatcher.dispatch({
        type: "STREAM_START",
        streamType: !isCall ? "guild" : "call",
        guildId: !isCall ? channel.getGuildId() : null,
        channelId: channelId,
        sourceId: sourceId,
        audioSourceId: audioSourceId ?? "default",
        sound: settings.store.sound,
        previewDisabled: disableStreamPreviews.getSetting()
    });
}

function saveStreamSettings(e: StreamStartEventArgs) {
    Object.assign(settings.store, {
        sourceId: e.sourceId,
        audioSourceId: e.audioSourceId,
        sound: e.sound
    });
}
