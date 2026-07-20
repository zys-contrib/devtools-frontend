// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import sinon from 'sinon';

import * as SDK from '../../core/sdk/sdk.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import {createTarget, describeWithEnvironment} from '../../testing/EnvironmentHelpers.js';
import {MockCDPConnection} from '../../testing/MockCDPConnection.js';

import * as Resources from './application.js';

describeWithEnvironment('IndexedDBModel', () => {
  let indexedDBModel: Resources.IndexedDBModel.IndexedDBModel;
  let target: SDK.Target.Target;
  let connection: MockCDPConnection;
  let indexedDBAgent: ProtocolProxyApi.IndexedDBApi;
  let manager: SDK.StorageBucketsModel.StorageBucketsModel|null;
  const testKey = 'test-storage-key/';
  const testStorageBucket = {
    storageKey: testKey,
    name: 'inbox',
  };
  const testStorageBucketInfo = {
    id: '0',
    bucket: testStorageBucket,
    expiration: 0,
    quota: 0,
    persistent: false,
    durability: Protocol.Storage.StorageBucketsDurability.Strict,
  };
  const testDBId = new Resources.IndexedDBModel.DatabaseId(testStorageBucket, 'test-database');

  beforeEach(async () => {
    connection = new MockCDPConnection();
    target = createTarget({connection});
    indexedDBModel = new Resources.IndexedDBModel.IndexedDBModel(target);
    indexedDBAgent = target.indexedDBAgent();
    manager = target.model(SDK.StorageBucketsModel.StorageBucketsModel);
  });

  describe('StorageKeyAdded', () => {
    it('registers database only when the model is enabled', async () => {
      const databaseAddedSpy = sinon.spy(indexedDBModel, 'dispatchEventToListeners');
      const dbNamePromise = new Promise<string>(resolve => {
        indexedDBModel.addEventListener(Resources.IndexedDBModel.Events.DatabaseAdded, event => {
          resolve(event.data.databaseId.name);
        });
      });
      connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: ['test-database']}));

      manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});
      assert.isFalse(databaseAddedSpy.calledWithExactly(
          Resources.IndexedDBModel.Events.DatabaseAdded as unknown as sinon.SinonMatcher,
          {model: indexedDBModel, databaseId: testDBId}));

      indexedDBModel.enable();
      manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});
      assert.strictEqual(await dbNamePromise, 'test-database');
    });

    it('starts tracking database', () => {
      const trackIndexedDBSpy = sinon.spy(target.storageAgent(), 'invoke_trackIndexedDBForStorageKey' as never);

      indexedDBModel.enable();
      manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

      sinon.assert.calledOnceWithExactly(trackIndexedDBSpy, {storageKey: testKey});
    });
  });

  describe('StorageKeyRemoved', () => {
    it('stops tracking database', () => {
      const untrackIndexedDBSpy = sinon.spy(target.storageAgent(), 'invoke_untrackIndexedDBForStorageKey' as never);

      indexedDBModel.enable();
      manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});
      manager?.storageBucketDeleted({bucketId: testStorageBucketInfo.id});

      sinon.assert.calledOnceWithExactly(untrackIndexedDBSpy, {storageKey: testKey});
    });
  });

  it('calls protocol method on clearObjectStore', () => {
    const clearObjectStoreSpy = sinon.spy(indexedDBAgent, 'invoke_clearObjectStore');

    indexedDBModel.enable();
    void indexedDBModel.clearObjectStore(testDBId, 'test-store');
    sinon.assert.calledOnceWithExactly(
        clearObjectStoreSpy,
        {storageBucket: testStorageBucket, databaseName: 'test-database', objectStoreName: 'test-store'});
  });

  it('calls protocol method on deleteEntries', () => {
    const testKeyRange = {lower: undefined, lowerOpen: false, upper: undefined, upperOpen: true} as IDBKeyRange;
    const deleteEntriesSpy = sinon.spy(indexedDBAgent, 'invoke_deleteObjectStoreEntries');

    indexedDBModel.enable();
    void indexedDBModel.deleteEntries(testDBId, 'test-store', testKeyRange);
    sinon.assert.calledOnceWithExactly(deleteEntriesSpy, {
      storageBucket: testStorageBucket,
      databaseName: 'test-database',
      objectStoreName: 'test-store',
      keyRange: testKeyRange,
    });
  });

  it('calls protocol method on refreshDatabaseNames and dispatches event', async () => {
    const requestDBNamesSpy = sinon.spy(indexedDBAgent, 'invoke_requestDatabaseNames');
    const dbRefreshedPromise = new Promise<void>(resolve => {
      indexedDBModel.addEventListener(Resources.IndexedDBModel.Events.DatabaseNamesRefreshed, () => {
        resolve();
      });
    });
    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: ['test-database']}));
    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

    void indexedDBModel.refreshDatabaseNames();

    sinon.assert.calledWithExactly(requestDBNamesSpy, {storageBucket: testStorageBucket});
    await dbRefreshedPromise;
  });

  it('requests database with storage key on refreshDatabase', async () => {
    const requestDatabaseSpy = sinon.spy(indexedDBAgent, 'invoke_requestDatabase');
    indexedDBModel.enable();

    void indexedDBModel.refreshDatabase(testDBId);

    sinon.assert.calledOnceWithExactly(
        requestDatabaseSpy, {storageBucket: testStorageBucket, databaseName: 'test-database'});
  });

  it('requests data with storage key on loadObjectStoreData', () => {
    const requestDataSpy = sinon.spy(indexedDBAgent, 'invoke_requestData');
    indexedDBModel.enable();

    indexedDBModel.loadObjectStoreData(testDBId, 'test-store', null, 0, 50, () => {});

    sinon.assert.calledOnceWithExactly(requestDataSpy, {
      storageBucket: testStorageBucket,
      databaseName: 'test-database',
      objectStoreName: 'test-store',
      indexName: undefined,
      skipCount: 0,
      pageSize: 50,
      keyRange: undefined,
    });
  });

  it('calls protocol method on getMetadata', async () => {
    const getMetadataSpy = sinon.stub(indexedDBAgent, 'invoke_getMetadata')
                               .resolves({entriesCount: 0, keyGeneratorValue: 0, getError: () => undefined});
    indexedDBModel.enable();

    await indexedDBModel.getMetadata(testDBId, new Resources.IndexedDBModel.ObjectStore('test-store', null, false));

    sinon.assert.calledOnceWithExactly(
        getMetadataSpy,
        {storageBucket: testStorageBucket, databaseName: 'test-database', objectStoreName: 'test-store'});
  });

  it('dispatches event on indexedDBContentUpdated', () => {
    const dispatcherSpy = sinon.spy(indexedDBModel, 'dispatchEventToListeners');

    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

    indexedDBModel.indexedDBContentUpdated(
        {origin: '', storageKey: testKey, bucketId: '0', databaseName: 'test-database', objectStoreName: 'test-store'});

    sinon.assert.calledOnceWithExactly(
        dispatcherSpy, Resources.IndexedDBModel.Events.IndexedDBContentUpdated as unknown as sinon.SinonMatcher,
        {databaseId: testDBId, objectStoreName: 'test-store', model: indexedDBModel});
  });

  it('requests database names and loads db on indexedDBListUpdated', async () => {
    const requestDBNamesSpy = sinon.spy(indexedDBAgent, 'invoke_requestDatabaseNames');
    const databaseLoadedPromise = new Promise<void>(resolve => {
      indexedDBModel.addEventListener(Resources.IndexedDBModel.Events.DatabaseLoaded, () => {
        resolve();
      });
    });
    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: ['test-database']}));
    connection.setSuccessHandler(
        'IndexedDB.requestDatabase',
        () => ({databaseWithObjectStores: {name: 'test-database', version: 1, objectStores: []}}));
    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

    indexedDBModel.indexedDBListUpdated({origin: '', storageKey: testKey, bucketId: '0'});

    sinon.assert.calledWithExactly(requestDBNamesSpy, {storageBucket: testStorageBucket});
    await databaseLoadedPromise;
  });

  it('gets databases added for storage key', async () => {
    const dbNames = ['test-database1', 'test-database2'];
    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: dbNames}));
    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});
    await indexedDBModel.refreshDatabaseNames();

    const databases = indexedDBModel.databases();

    assert.deepEqual(databases.map(db => db.name), dbNames);
  });

  it('calls protocol method on deleteDatabase', () => {
    const deleteDBSpy = sinon.spy(indexedDBAgent, 'invoke_deleteDatabase');
    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: ['test-database']}));
    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

    void indexedDBModel.deleteDatabase(testDBId);

    sinon.assert.calledOnceWithExactly(deleteDBSpy, {storageBucket: testStorageBucket, databaseName: 'test-database'});
  });

  it('removes databases for storage key on clearForStorageKey', async () => {
    const dbNames = ['test-database1', 'test-database-2'];
    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: dbNames}));
    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});
    await indexedDBModel.refreshDatabaseNames();
    connection.setHandler('IndexedDB.requestDatabaseNames', null);

    indexedDBModel.clearForStorageKey(testKey);

    assert.isEmpty(indexedDBModel.databases());
  });

  it('dispatches event with storage key on indexedDBContentUpdated when both storage key and origin are set', () => {
    const dispatcherSpy = sinon.spy(indexedDBModel, 'dispatchEventToListeners');

    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

    indexedDBModel.indexedDBContentUpdated({
      origin: 'test-origin',
      storageKey: testKey,
      bucketId: '0',
      databaseName: 'test-database',
      objectStoreName: 'test-store',
    });

    sinon.assert.calledOnceWithExactly(
        dispatcherSpy, Resources.IndexedDBModel.Events.IndexedDBContentUpdated as unknown as sinon.SinonMatcher,
        {databaseId: testDBId, objectStoreName: 'test-store', model: indexedDBModel});
  });

  it('handles protocol error and does not invoke callback when loading object store data fails', async () => {
    const callbackSpy = sinon.spy();
    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: ['test-database']}));
    connection.setFailureHandler('IndexedDB.requestData', () => ({message: 'Aborted upgrade.', code: -32000}));

    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});
    await indexedDBModel.refreshDatabaseNames();

    indexedDBModel.loadObjectStoreData(testDBId, 'test-store', null, 0, 2, callbackSpy);
    await new Promise(resolve => setTimeout(resolve, 0));

    sinon.assert.notCalled(callbackSpy);
  });

  it('loads database structure with object stores and indexes', async () => {
    const databaseWithObjectStores: Protocol.IndexedDB.DatabaseWithObjectStores = {
      name: 'test-database',
      version: 1,
      objectStores: [
        {
          name: 'testObjectStore1',
          keyPath: {
            type: Protocol.IndexedDB.KeyPathType.String,
            string: 'test.key.path',
          },
          autoIncrement: true,
          indexes: [],
        },
        {
          name: 'testObjectStore2',
          keyPath: {
            type: Protocol.IndexedDB.KeyPathType.Null,
          },
          autoIncrement: false,
          indexes: [
            {
              name: 'testIndexName1',
              keyPath: {
                type: Protocol.IndexedDB.KeyPathType.String,
                string: '',
              },
              unique: false,
              multiEntry: true,
            },
            {
              name: 'testIndexName2',
              keyPath: {
                type: Protocol.IndexedDB.KeyPathType.Array,
                array: ['key.path1', 'key.path2'],
              },
              unique: true,
              multiEntry: false,
            },
          ],
        },
      ],
    };

    const databaseLoadedPromise = new Promise<Resources.IndexedDBModel.Database>(resolve => {
      indexedDBModel.addEventListener(Resources.IndexedDBModel.Events.DatabaseLoaded, event => {
        resolve(event.data.database);
      });
    });

    connection.setSuccessHandler('IndexedDB.requestDatabaseNames', () => ({databaseNames: ['test-database']}));
    connection.setSuccessHandler('IndexedDB.requestDatabase', () => ({databaseWithObjectStores}));
    indexedDBModel.enable();
    manager?.storageBucketCreatedOrUpdated({bucketInfo: testStorageBucketInfo});

    indexedDBModel.refreshDatabase(testDBId);
    const database = await databaseLoadedPromise;

    assert.strictEqual(database.databaseId.name, 'test-database');
    assert.strictEqual(database.version, 1);
    assert.strictEqual(database.objectStores.size, 2);

    const store1 = database.objectStores.get('testObjectStore1');
    assert.exists(store1);
    assert.strictEqual(store1.name, 'testObjectStore1');
    assert.strictEqual(store1.keyPath, 'test.key.path');
    assert.strictEqual(store1.keyPathString, '"test.key.path"');
    assert.isTrue(store1.autoIncrement);
    assert.strictEqual(store1.indexes.size, 0);

    const store2 = database.objectStores.get('testObjectStore2');
    assert.exists(store2);
    assert.strictEqual(store2.name, 'testObjectStore2');
    assert.isNull(store2.keyPath);
    assert.isNull(store2.keyPathString);
    assert.isFalse(store2.autoIncrement);
    assert.strictEqual(store2.indexes.size, 2);

    const index1 = store2.indexes.get('testIndexName1');
    assert.exists(index1);
    assert.strictEqual(index1.name, 'testIndexName1');
    assert.strictEqual(index1.keyPath, '');
    assert.strictEqual(index1.keyPathString, '""');
    assert.isFalse(index1.unique);
    assert.isTrue(index1.multiEntry);

    const index2 = store2.indexes.get('testIndexName2');
    assert.exists(index2);
    assert.strictEqual(index2.name, 'testIndexName2');
    assert.deepEqual(index2.keyPath, ['key.path1', 'key.path2']);
    assert.strictEqual(index2.keyPathString, '["key.path1", "key.path2"]');
    assert.isTrue(index2.unique);
    assert.isFalse(index2.multiEntry);
  });
});
