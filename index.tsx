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

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, SelectedChannelStore, UserStore } from "@webpack/common";

let updatePreviewFunc: Function;
let stream: any;

const { setGoLiveSource } = findByPropsLazy("setGoLiveSource");

function listener(e) {
    updatePreviewListener(e);
    startStreamListener(e);
}

function updatePreviewListener(e) {
    if (e.code !== "KeyR" || !e.ctrlKey || !e.shiftKey) return;

    updatePreview(stream);
}

function updatePreview(stream) {
    if (!stream || !updatePreviewFunc) return;

    const { guildId: t, channelId: n, userId: i, streamId: o, context: a } = stream;

    updatePreviewFunc(o, t, n, i);
}


function startStreamListener(e) {
    if (e.code !== "KeyS" || !e.ctrlKey || !e.shiftKey || stream) return;

    startStream();
}

async function startStream() {
    const channelId = SelectedChannelStore.getChannelId();
    const guildId = channelId ? ChannelStore.getChannel(channelId).getGuildId() : null;

    if (!guildId || !channelId) return;

    const sourceName = "OBS Virtual Camera";
    const audioSourceId = "{0.0.1.00000000}.{ae6ece1b-a964-4211-8e70-dff338710df5}";

    await setGoLiveSource({
        "cameraSettings": {
            "videoDeviceGuid": sourceName,
            "audioDeviceGuid": audioSourceId
        },
        "qualityOptions": {
            "preset": 3,
            "resolution": 1080,
            "frameRate": 30
        },
        "context": "stream"
    });

    await FluxDispatcher.dispatch({
        type: "STREAM_START",
        streamType: "guild",
        guildId: guildId,
        channelId: channelId,
        appContext: "APP",
        sourceId: `camera:${sourceName}`,
        sourceName: sourceName,
        audioSourceId: audioSourceId,
        sound: true,
        previewDisabled: false
    });
}

export default definePlugin({
    name: "streamUtilities",
    description: "Improves the quality of the screen share preview",
    authors: [Devs.Zorian],
    patches: [
        {
            find: "\"ApplicationStreamPreviewUploadManager\"",
            replacement: [{
                match: /\i===\i&&\(\i\?(?:\i\.start\(\i,(\i)\):?){2}\)/,
                replace: ""
            }, {
                match: /,\i===\i&&\i\.start\(\i,(\i)\)/,
                replace: ""
            }, {
                match: /\i\.stop\(\),/,
                replace: ""
            }, {
                match: /(?<=let (\i)=\i\(\)\.debounce.+?,\d+\);)/,
                replace: "$self.saveUpdatePreview($1);"
            }, {
                match: /,\i\(\i,\i,\i,\i\)/,
                replace: ""
            }]
        }
    ],

    start: () => {
        document.addEventListener("keydown", listener);
    },

    flux: {
        RTC_CONNECTION_VIDEO: e => {
            const myId = UserStore.getCurrentUser().id;
            const { guildId: t, channelId: n, userId: i, streamId: o, context: a } = e;

            if (a !== "stream" || !o || i !== myId || !updatePreviewFunc) return;

            const isStart = !stream;
            stream = e;

            if (!isStart) return;

            updatePreview(stream);
        },
        STREAM_DELETE: () => {
            stream = null;
        },
        LOGOUT: () => {
            stream = null;
        },
        CONNECTION_OPEN: () => {
            stream = null;
        }
    },

    saveUpdatePreview: (func: Function) => {
        updatePreviewFunc = func;
    },
});
