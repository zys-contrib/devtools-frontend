
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../core/common/common.js';

import {type ResponseData, ResponseType} from './agents/AiAgent.js';

const MAX_TITLE_LENGTH = 80;

export const enum ConversationType {
  STYLING = 'freestyler',
  FILE = 'drjones-file',
  NETWORK = 'drjones-network-request',
  PERFORMANCE = 'drjones-performance',
  PERFORMANCE_INSIGHT = 'performance-insight',
}

export const NOT_FOUND_IMAGE_DATA = '';

export interface SerializedConversation {
  id: string;
  type: ConversationType;
  history: ResponseData[];
  isExternal: boolean;
}

export interface SerializedImage {
  id: string;
  // The IANA standard MIME type of the source data.
  // Currently supported types are: image/png, image/jpeg.
  // Format: base64-encoded
  // For reference: google3/google/x/pitchfork/aida/v1/content.proto
  mimeType: string;
  data: string;
}

export class Conversation {
  readonly id: string;
  readonly type: ConversationType;
  #isReadOnly: boolean;
  readonly history: ResponseData[];
  #isExternal: boolean;

  constructor(
      type: ConversationType, data: ResponseData[] = [], id: string = crypto.randomUUID(), isReadOnly = true,
      isExternal = false) {
    this.type = type;
    this.id = id;
    this.#isReadOnly = isReadOnly;
    this.#isExternal = isExternal;
    this.history = this.#reconstructHistory(data);
  }

  get isReadOnly(): boolean {
    return this.#isReadOnly;
  }

  get title(): string|undefined {
    const query = this.history.find(response => response.type === ResponseType.USER_QUERY)?.query;

    if (!query) {
      return;
    }

    if (this.#isExternal) {
      return `[External] ${query.substring(0, MAX_TITLE_LENGTH - 11)}${
          query.length > MAX_TITLE_LENGTH - 11 ? '…' : ''}`;
    }
    return `${query.substring(0, MAX_TITLE_LENGTH)}${query.length > MAX_TITLE_LENGTH ? '…' : ''}`;
  }

  get isEmpty(): boolean {
    return this.history.length === 0;
  }

  #reconstructHistory(historyWithoutImages: ResponseData[]): ResponseData[] {
    const imageHistory = AiHistoryStorage.instance().getImageHistory();
    if (imageHistory && imageHistory.length > 0) {
      const history: ResponseData[] = [];
      for (const data of historyWithoutImages) {
        if (data.type === ResponseType.USER_QUERY && data.imageId) {
          const image = imageHistory.find(item => item.id === data.imageId);
          const inlineData = image ? {data: image.data, mimeType: image.mimeType} :
                                     {data: NOT_FOUND_IMAGE_DATA, mimeType: 'image/jpeg'};
          history.push({...data, imageInput: {inlineData}});
        } else {
          history.push(data);
        }
      }
      return history;
    }
    return historyWithoutImages;
  }

  archiveConversation(): void {
    this.#isReadOnly = true;
  }

  async addHistoryItem(item: ResponseData): Promise<void> {
    this.history.push(item);
    await AiHistoryStorage.instance().upsertHistoryEntry(this.serialize());
    if (item.type === ResponseType.USER_QUERY) {
      if (item.imageId && item.imageInput && 'inlineData' in item.imageInput) {
        const inlineData = item.imageInput.inlineData;
        await AiHistoryStorage.instance().upsertImage(
            {id: item.imageId, data: inlineData.data, mimeType: inlineData.mimeType});
      }
    }
  }

  serialize(): SerializedConversation {
    return {
      id: this.id,
      history: this.history.map(item => {
        if (item.type === ResponseType.USER_QUERY) {
          return {...item, imageInput: undefined};
        }
        return item;
      }),
      type: this.type,
      isExternal: this.#isExternal,
    };
  }
}

let instance: AiHistoryStorage|null = null;

const DEFAULT_MAX_STORAGE_SIZE = 50 * 1024 * 1024;

export const enum Events {
  HISTORY_DELETED = 'AiHistoryDeleted',
}

export interface EventTypes {
  [Events.HISTORY_DELETED]: void;
}

export class AiHistoryStorage extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
  #historySetting: Common.Settings.Setting<SerializedConversation[]>;
  #imageHistorySettings: Common.Settings.Setting<SerializedImage[]>;
  #mutex = new Common.Mutex.Mutex();
  #maxStorageSize: number;

  constructor(maxStorageSize = DEFAULT_MAX_STORAGE_SIZE) {
    super();
    this.#historySetting = Common.Settings.Settings.instance().createSetting('ai-assistance-history-entries', []);
    this.#imageHistorySettings = Common.Settings.Settings.instance().createSetting(
        'ai-assistance-history-images',
        [],
    );
    this.#maxStorageSize = maxStorageSize;
  }

  clearForTest(): void {
    this.#historySetting.set([]);
    this.#imageHistorySettings.set([]);
  }

  async upsertHistoryEntry(agentEntry: SerializedConversation): Promise<void> {
    const release = await this.#mutex.acquire();
    try {
      const history = structuredClone(await this.#historySetting.forceGet());
      const historyEntryIndex = history.findIndex(entry => entry.id === agentEntry.id);
      if (historyEntryIndex !== -1) {
        history[historyEntryIndex] = agentEntry;
      } else {
        history.push(agentEntry);
      }
      this.#historySetting.set(history);
    } finally {
      release();
    }
  }

  async upsertImage(image: SerializedImage): Promise<void> {
    const release = await this.#mutex.acquire();
    try {
      const imageHistory = structuredClone(await this.#imageHistorySettings.forceGet());
      const imageHistoryEntryIndex = imageHistory.findIndex(entry => entry.id === image.id);
      if (imageHistoryEntryIndex !== -1) {
        imageHistory[imageHistoryEntryIndex] = image;
      } else {
        imageHistory.push(image);
      }

      const imagesToBeStored: SerializedImage[] = [];
      let currentStorageSize = 0;

      for (const [, serializedImage] of Array
               .from(
                   imageHistory.entries(),
                   )
               .reverse()) {
        if (currentStorageSize >= this.#maxStorageSize) {
          break;
        }
        currentStorageSize += serializedImage.data.length;
        imagesToBeStored.push(serializedImage);
      }

      this.#imageHistorySettings.set(imagesToBeStored.reverse());
    } finally {
      release();
    }
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    const release = await this.#mutex.acquire();
    try {
      const history = structuredClone(await this.#historySetting.forceGet());
      const imageIdsForDeletion = history.find(entry => entry.id === id)
                                      ?.history
                                      .map(item => {
                                        if (item.type === ResponseType.USER_QUERY && item.imageId) {
                                          return item.imageId;
                                        }
                                        return undefined;
                                      })
                                      .filter(item => !!item);
      this.#historySetting.set(
          history.filter(entry => entry.id !== id),
      );
      const images = structuredClone(await this.#imageHistorySettings.forceGet());
      this.#imageHistorySettings.set(
          // Filter images for which ids are not present in deletion list
          images.filter(entry => !Boolean(imageIdsForDeletion?.find(id => id === entry.id))));
    } finally {
      release();
    }
  }

  async deleteAll(): Promise<void> {
    const release = await this.#mutex.acquire();
    try {
      this.#historySetting.set([]);
      this.#imageHistorySettings.set([]);
    } finally {
      release();
      this.dispatchEventToListeners(Events.HISTORY_DELETED);
    }
  }

  getHistory(): SerializedConversation[] {
    return structuredClone(this.#historySetting.get());
  }

  getImageHistory(): SerializedImage[] {
    return structuredClone(this.#imageHistorySettings.get());
  }

  static instance(
      opts: {
        forceNew: boolean,
        maxStorageSize?: number,
      } = {forceNew: false, maxStorageSize: DEFAULT_MAX_STORAGE_SIZE},
      ): AiHistoryStorage {
    const {forceNew, maxStorageSize} = opts;
    if (!instance || forceNew) {
      instance = new AiHistoryStorage(maxStorageSize);
    }
    return instance;
  }
}
