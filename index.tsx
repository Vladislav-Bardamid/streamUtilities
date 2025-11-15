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
import { ScreenshareIcon } from "@components/index";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile } from "@utils/web";
import { User } from "@vencord/discord-types";
import { findByPropsLazy, findLazy, findStoreLazy } from "@webpack";
import { ChannelStore, Constants, FluxDispatcher, Menu, RestAPI, SelectedChannelStore, UserStore } from "@webpack/common";

import { FrameData, RTCConnectionVideoEventArgs, Stream, StreamStartEventArgs } from "./types";
import { streamToStreamKey } from "./utils";

const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");
const disableStreamPreviews = getUserSettingLazy<boolean>("voiceAndVideo", "disableStreamPreviews")!;
const ChannelTypes = findLazy(m => m.ANNOUNCEMENT_THREAD === 10);
const { setGoLiveSource } = findByPropsLazy("setGoLiveSource");

const maxWidth = 512;
const maxHeight = 512;

let retryUpdate: any | undefined;

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

    contextMenus: {
        "stream-context": streamContext,
        "manage-streams": streamsContext,
        "user-context": userContext
    },

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
            if (e.code !== "KeyS" || !e.ctrlKey || !e.shiftKey || e.altKey) return;

            streamId
                ? uploadScreenPreview()
                : startStream();
        });
    },

    flux: {
        RTC_CONNECTION_VIDEO: (e: RTCConnectionVideoEventArgs) => {
            const myId = UserStore.getCurrentUser().id;

            if (e.context !== "stream" || e.userId !== myId) return;

            streamId = e.streamId;

            if (streamId || !retryUpdate) return;

            clearTimeout(retryUpdate);
            retryUpdate = undefined;
        },
        STREAM_START: (e: StreamStartEventArgs) => {
            saveStreamSettings(e);
        }
    }
});

async function uploadPreview(stream?: Stream) {
    const file = await chooseFile("image/*");
    if (!file) return;

    stream ??= ApplicationStreamingStore.getCurrentUserActiveStream();
    const streamKey = streamToStreamKey(stream!);

    const image = await createImageBitmap(file);

    updatePreview(streamKey, image);
}

async function uploadScreenPreview(stream?: Stream) {
    stream ??= ApplicationStreamingStore.getCurrentUserActiveStream();
    const streamKey = streamToStreamKey(stream!);

    const discordVoice = DiscordNative.nativeModules.requireModule("discord_voice");

    const frame = await discordVoice.getNextVideoOutputFrame(streamId) as FrameData;
    const imageData = new ImageData(frame.data, frame.width, frame.height);

    updatePreview(streamKey, imageData);
}

async function updatePreview(streamKey: string, data: ImageData | ImageBitmap) {
    const { width, height } = data;
    const isWidthLarge = width > maxWidth;
    const bitmap = await createImageBitmap(data, {
        resizeWidth: isWidthLarge ? maxWidth : undefined,
        resizeHeight: isWidthLarge ? undefined : maxHeight,
        resizeQuality: "high"
    });

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width ?? width;
    canvas.height = bitmap.height ?? height;

    const ctx = canvas.getContext("2d");
    ctx!.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
    const imageData = canvas.toDataURL("image/jpeg");

    FluxDispatcher.dispatch({
        type: "STREAM_PREVIEW_FETCH_SUCCESS",
        streamKey: streamKey,
        previewURL: imageData
    });

    postPreview(streamKey, imageData);

    const previewDisabled = disableStreamPreviews.getSetting();
    if (previewDisabled) return;

    disableStreamPreviews.updateSetting(true);
}

async function postPreview(streamKey: string, imageData: string) {
    try {
        await RestAPI.post({
            url: Constants.Endpoints.STREAM_PREVIEW(streamKey),
            body: {
                thumbnail: imageData
            }
        });
    }
    catch (e: any) {
        if (e.status !== 429) throw e;

        const retryAfter = e.body.retry_after;

        if (retryUpdate) {
            clearTimeout(retryUpdate);
        }

        retryUpdate = setTimeout(async () => {
            await postPreview(streamKey, imageData);
            retryUpdate = undefined;
        }, retryAfter);
    }
}

function streamContext(children, { stream }: { stream: Stream; }) {
    const myId = UserStore.getCurrentUser().id;
    if (stream.ownerId !== myId) return;

    const previewDisabled = disableStreamPreviews.getSetting();

    const disablePreviewItem = (
        <Menu.MenuCheckboxItem
            checked={previewDisabled}
            label={"Disable Preview Updating"}
            id="disable-previews-updating"
            action={() => disableStreamPreviews.updateSetting(!previewDisabled)}
        />
    );
    const customPreviewItem = (
        <Menu.MenuItem
            label="Upload Preview"
            id="upload-preview"
            icon={ScreenshareIcon}
            action={() => uploadPreview(stream)}
        />
    );
    const capturePreviewItem = (
        <Menu.MenuItem
            label="Capture Preview"
            id="capture-preview"
            icon={ScreenshareIcon}
            action={() => uploadScreenPreview(stream)}
        />
    );
    children.push(
        <Menu.MenuSeparator />,
        disablePreviewItem,
        <Menu.MenuSeparator />,
        customPreviewItem,
        capturePreviewItem
    );
}

function streamsContext(children, { activeStreams }: { activeStreams: Stream[]; }) {
    const stream = activeStreams[0];
    if (!stream) return;

    streamContext(children, { stream });
}

function userContext(children, { user }: { user: User; }) {
    const myId = UserStore.getCurrentUser().id;
    if (user.id !== myId) return;

    const stream = ApplicationStreamingStore.getCurrentUserActiveStream();
    if (!stream) return;

    streamContext(children, { stream });
}

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
