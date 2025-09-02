/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface RTCConnectionVideoEventArgs {
    guildId: string;
    channelId: string;
    userId: string;
    streamId: number;
    context: string;
}

interface StreamStartEventArgs {
    appContext: string;
    audioSourceId: string;
    channelId: string;
    guildId: string;
    previewDisabled: boolean;
    sound: boolean;
    sourceId: string;
    sourceName: string;
    streamType: string;
    type: string;
}

interface Stream {
    channelId: string;
    guildId: string;
    ownerId: string;
    state: string;
    streamType: string;
}
