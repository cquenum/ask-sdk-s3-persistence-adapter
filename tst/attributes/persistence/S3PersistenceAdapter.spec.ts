/*
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import {
    DeleteObjectCommand,
    GetObjectCommand,
    GetObjectCommandOutput,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3';
import { mockClient } from "aws-sdk-client-mock";
import { expect } from 'chai';
import { ObjectKeyGenerators } from '../../../lib/attributes/persistence/ObjectKeyGenerators';
import { S3PersistenceAdapter } from '../../../lib/attributes/persistence/S3PersistenceAdapter';
import { JsonProvider } from '../../mocks/JsonProvider';

const s3Mock = mockClient(S3Client);

describe('S3PersistenceAdapter', () => {
    const bucketName = 'mockBucket';
    const defaultAttributes = {
        defaultKey: 'defaultValue',
    };

    const defaultAttributesOutput: GetObjectCommandOutput = { $metadata: null };
    Object.defineProperty(defaultAttributesOutput, 'Body', {
        value: Buffer.from(JSON.stringify(defaultAttributes)),
        writable: false,
    });

    const customAttributes = {
        customKey: 'customValue',
    };

    const customAttributesOutput: GetObjectCommandOutput = { $metadata: null };
    Object.defineProperty(customAttributesOutput, 'Body', {
        value: Buffer.from(JSON.stringify(customAttributes)),
        writable: false,
    });


    const nonJsonObjectAttributes = 'This is a non json string';

    const pathPrefixObjectAttributes = {
        pathPrefixKey: 'pathPrefixValue',
    };

    const pathPrefixObjectAttributesOutput: GetObjectCommandOutput = { $metadata: null };
    Object.defineProperty(pathPrefixObjectAttributesOutput, 'Body', {
        value: Buffer.from(JSON.stringify(pathPrefixObjectAttributes)),
        writable: false,
    });

    const nonJsonObjectAttributesOutput: GetObjectCommandOutput = { $metadata: null };
    Object.defineProperty(nonJsonObjectAttributesOutput, 'Body', {
        value: Buffer.from(nonJsonObjectAttributes),
        writable: false,
    });

    const mockRequestOutput: GetObjectCommandOutput = { $metadata: null };
    Object.defineProperty(mockRequestOutput, 'Body', {
        value: Buffer.from(JSON.stringify({})),
        writable: false
    });

    const bucketInvalidError = new Error('The specified bucket is not valid.');
    Object.defineProperty(bucketInvalidError, 'code', {
        value: 'InvalidBucketName',
        writable: false,
    });

    const noSuchKeyError = new Error('The specified key does not exist.');
    Object.defineProperty(noSuchKeyError, 'code', {
        value: 'NoSuchKey',
        writable: false,
    });

    const requestEnvelope = JsonProvider.requestEnvelope();
    requestEnvelope.context.System.device.deviceId = 'deviceId';
    requestEnvelope.context.System.user.userId = 'userId';

    before((done) => {
        s3Mock.reset();
        done();
    });

    after((done) => {
        s3Mock.restore();
        done();
    });

    it('should be able to get an item from bucket', async () => {
        const defaultPersistenceAdapter = new S3PersistenceAdapter({
            bucketName,
        });
        const customPersistenceAdapter = new S3PersistenceAdapter({
            bucketName,
            s3Client: new S3Client({ apiVersion: 'latest' }),
            objectKeyGenerator: ObjectKeyGenerators.deviceId,
        });
        const pathPrefixPersistenceAdapter = new S3PersistenceAdapter({
            bucketName,
            pathPrefix: 'folder',
        });

        s3Mock.on(GetObjectCommand).resolves(defaultAttributesOutput);
        const defaultResult = await defaultPersistenceAdapter.getAttributes(requestEnvelope);
        expect(defaultResult.defaultKey).eq('defaultValue');

        s3Mock.on(GetObjectCommand).resolves(customAttributesOutput);
        const customResult = await customPersistenceAdapter.getAttributes(requestEnvelope);
        expect(customResult.customKey).eq('customValue');

        s3Mock.on(GetObjectCommand).resolves(pathPrefixObjectAttributesOutput);
        const pathPrefixResult = await pathPrefixPersistenceAdapter.getAttributes(requestEnvelope);
        expect(pathPrefixResult.pathPrefixKey).eq('pathPrefixValue');
    });

    it('should be able to put an item to bucket', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName,
        });

        s3Mock.on(PutObjectCommand).resolves({});
        await persistenceAdapter.saveAttributes(requestEnvelope, {});
    });

    it('should be able to delete an item from bucket', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName,
        });

        s3Mock.on(DeleteObjectCommand).resolves({});
        await persistenceAdapter.deleteAttributes(requestEnvelope);
    });

    it('should return an empty object when getting item that does not exist in bucket', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName,
        });

        const mockRequestEnvelope = JsonProvider.requestEnvelope();
        mockRequestEnvelope.context.System.user.userId = 'NonExistentKey';

        s3Mock.on(GetObjectCommand).resolves(mockRequestOutput);
        const result = await persistenceAdapter.getAttributes(mockRequestEnvelope);
        expect(result).deep.equal({});
    });

    it('should return an empty object when getting item that has empty value', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName,
        });

        const mockRequestEnvelope = JsonProvider.requestEnvelope();
        mockRequestEnvelope.context.System.user.userId = 'emptyBodyKey';

        s3Mock.on(GetObjectCommand).resolves({});
        const result = await persistenceAdapter.getAttributes(mockRequestEnvelope);
        expect(result).deep.equal({});
    });

    it('should throw an error when reading and the bucket does not exist', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName: 'NonExistentBucket',
        });

        s3Mock.on(GetObjectCommand).rejects(bucketInvalidError);
        try {
            await persistenceAdapter.getAttributes(requestEnvelope);
        } catch (err) {
            expect(err.name).equal('AskSdk.S3PersistenceAdapter Error');
            expect(err.message).equal('Could not read item (userId) from bucket (NonExistentBucket): ' +
                'The specified bucket is not valid.');

            return;
        }
        throw new Error('should have thrown an error!');
    });

    it('should throw an error when saving and the bucket does not exist', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName: 'NonExistentBucket',
        });

        s3Mock.on(PutObjectCommand).rejects(bucketInvalidError);
        try {
            await persistenceAdapter.saveAttributes(requestEnvelope, {});
        } catch (err) {
            expect(err.name).equal('AskSdk.S3PersistenceAdapter Error');
            expect(err.message).equal('Could not save item (userId) to bucket (NonExistentBucket): ' +
                'The specified bucket is not valid.');

            return;
        }
        throw new Error('should have thrown an error!');
    });

    it('should throw an error when deleting and the bucket does not exist', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName: 'NonExistentBucket',
        });

        s3Mock.on(DeleteObjectCommand).rejects(bucketInvalidError);
        try {
            await persistenceAdapter.deleteAttributes(requestEnvelope);
        } catch (err) {
            expect(err.name).equal('AskSdk.S3PersistenceAdapter Error');
            expect(err.message).equal('Could not delete item (userId) from bucket (NonExistentBucket): ' +
                'The specified bucket is not valid.');

            return;
        }
        throw new Error('should have thrown an error!');
    });

    it('should throw an error when getting invalid json object', async () => {
        const persistenceAdapter = new S3PersistenceAdapter({
            bucketName,
        });

        const mockRequestEnvelope = JsonProvider.requestEnvelope();
        mockRequestEnvelope.context.System.user.userId = 'nonJsonObjectKey';

        s3Mock.on(GetObjectCommand).resolves(nonJsonObjectAttributesOutput);
        try {
            await persistenceAdapter.getAttributes(mockRequestEnvelope);
        } catch (err) {
            expect(err.name).equal('SyntaxError');
            expect(err.message).equal('Failed trying to parse the data body: This is a non json string');

            return;
        }
        throw new Error('should have thrown an error!');
    });
});
