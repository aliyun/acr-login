const core = require('@actions/core');
const OpenApi = require('@alicloud/openapi-client');
const CR20181201 = require('@alicloud/cr20181201');
const { Docker } = require('@docker/actions-toolkit/lib/docker/docker');

// Mock the modules
jest.mock('@actions/core');
jest.mock('@alicloud/openapi-client');
jest.mock('@alicloud/cr20181201');
jest.mock('@docker/actions-toolkit/lib/docker/docker');

// Import functions to test
const { getAPIEndpoint, getRegistryEndpoint, run } = require('../src/login.js');

describe('getAPIEndpoint', () => {
    test('should return correct API endpoint URL', () => {
        const regionId = 'cn-hangzhou';
        const expected = 'https://cr.cn-hangzhou.aliyuncs.com';
        expect(getAPIEndpoint(regionId)).toBe(expected);
    });
});

describe('getRegistryEndpoint', () => {
    test('should return correct registry endpoint URL', () => {
        const regionId = 'cn-hangzhou';
        const expected = 'https://registry.cn-hangzhou.aliyuncs.com';
        expect(getRegistryEndpoint(regionId)).toBe(expected);
    });
});

describe('run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should fail when accessKeyId is provided but accessKeySecret is missing', async () => {
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return '';
                case 'region-id': return 'cn-hangzhou';
                default: return '';
            }
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith('Action failed: access-key-secret is required when access-key-id is provided');
    });

    test('should fail when accessKeyId is provided but regionId is missing', async () => {
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return '';
                default: return '';
            }
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith('Action failed: region-id is required when access-key-id is provided');
    });

    test('should use ROA client when accessKeyId and regionId are provided but instanceId is missing', async () => {
        const mockCallApi = jest.fn().mockResolvedValue({
            body: { data: { tempUserName: 'temp-user', authorizationToken: 'temp-token' } }
        });

        OpenApi.default.mockImplementation(() => ({ callApi: mockCallApi }));

        Docker.getExecOutput.mockResolvedValue({ stderr: '', exitCode: 0 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return 'cn-hangzhou';
                case 'instance-id': return '';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(OpenApi.default).toHaveBeenCalledWith(expect.objectContaining({
            accessKeyId: 'test-access-key-id',
            accessKeySecret: 'test-access-key-secret',
            endpoint: 'cr.cn-hangzhou.aliyuncs.com',
            protocol: 'HTTPS'
        }));

        expect(mockCallApi).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'GetAuthorizationToken',
                version: '2016-06-07',
                pathname: '/tokens',
                method: 'GET',
                style: 'ROA',
                bodyType: 'json'
            }),
            expect.any(Object),
            expect.any(Object)
        );

        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'temp-user', 'https://registry.cn-hangzhou.aliyuncs.com'],
            { ignoreReturnCode: true, silent: true, input: Buffer.from('temp-token') }
        );

        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });

    test('should use RPC client when accessKeyId, regionId, and instanceId are provided', async () => {
        const mockGetAuthorizationToken = jest.fn().mockResolvedValue({
            body: { tempUsername: 'temp-user', authorizationToken: 'temp-token' }
        });

        CR20181201.default.mockImplementation(() => ({
            getAuthorizationToken: mockGetAuthorizationToken
        }));

        Docker.getExecOutput.mockResolvedValue({ stderr: '', exitCode: 0 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return 'cn-hangzhou';
                case 'instance-id': return 'cri-12345';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(CR20181201.default).toHaveBeenCalledWith(expect.objectContaining({
            accessKeyId: 'test-access-key-id',
            accessKeySecret: 'test-access-key-secret',
            endpoint: 'cr.cn-hangzhou.aliyuncs.com',
            protocol: 'HTTPS'
        }));

        expect(mockGetAuthorizationToken).toHaveBeenCalledWith(
            expect.objectContaining({ instanceId: 'cri-12345' })
        );

        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'temp-user', 'https://index.docker.io/v1/'],
            { ignoreReturnCode: true, silent: true, input: Buffer.from('temp-token') }
        );

        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });

    test('should use provided username and password when accessKeyId is not provided', async () => {
        Docker.getExecOutput.mockResolvedValue({ stderr: '', exitCode: 0 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'username': return 'test-user';
                case 'password': return 'test-password';
                case 'login-server': return 'https://custom.registry.com';
                default: return '';
            }
        });

        await run();

        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'test-user', 'https://custom.registry.com'],
            { ignoreReturnCode: true, silent: true, input: Buffer.from('test-password') }
        );
        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });

    test('should use default Docker Hub when no login-server is provided', async () => {
        Docker.getExecOutput.mockResolvedValue({ stderr: '', exitCode: 0 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'username': return 'test-user';
                case 'password': return 'test-password';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'test-user', 'https://index.docker.io/v1/'],
            { ignoreReturnCode: true, silent: true, input: Buffer.from('test-password') }
        );
        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });

    test('should fail when ROA client request fails', async () => {
        const errorMessage = 'ROA client error';

        OpenApi.default.mockImplementation(() => ({
            callApi: jest.fn().mockRejectedValue(new Error(errorMessage))
        }));

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return 'cn-hangzhou';
                case 'instance-id': return '';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith(`Action failed to get authorization token: ${errorMessage}`);
    });

    test('should fail when RPC client request fails', async () => {
        const errorMessage = 'RPC client error';

        CR20181201.default.mockImplementation(() => ({
            getAuthorizationToken: jest.fn().mockRejectedValue(new Error(errorMessage))
        }));

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return 'cn-hangzhou';
                case 'instance-id': return 'cri-12345';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith(`Action failed to get authorization token: ${errorMessage}`);
    });

    test('should fail when Docker login fails', async () => {
        const errorMessage = 'Docker login error';

        Docker.getExecOutput.mockResolvedValue({ stderr: errorMessage, exitCode: 1 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'username': return 'test-user';
                case 'password': return 'test-password';
                case 'login-server': return 'https://custom.registry.com';
                default: return '';
            }
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith(`Docker login failed: ${errorMessage}`);
    });

    test('should use custom endpoint when provided', async () => {
        const mockCallApi = jest.fn().mockResolvedValue({
            body: { data: { tempUserName: 'temp-user', authorizationToken: 'temp-token' } }
        });

        OpenApi.default.mockImplementation(() => ({ callApi: mockCallApi }));

        Docker.getExecOutput.mockResolvedValue({ stderr: '', exitCode: 0 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return 'cn-hangzhou';
                case 'instance-id': return '';
                case 'endpoint': return 'https://custom.endpoint.com';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(OpenApi.default).toHaveBeenCalledWith(expect.objectContaining({
            endpoint: 'custom.endpoint.com',
            protocol: 'HTTPS'
        }));
    });

    test('should use default endpoint when endpoint is not provided', async () => {
        const mockCallApi = jest.fn().mockResolvedValue({
            body: { data: { tempUserName: 'temp-user', authorizationToken: 'temp-token' } }
        });

        OpenApi.default.mockImplementation(() => ({ callApi: mockCallApi }));

        Docker.getExecOutput.mockResolvedValue({ stderr: '', exitCode: 0 });

        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': return 'test-access-key-id';
                case 'access-key-secret': return 'test-access-key-secret';
                case 'region-id': return 'cn-hangzhou';
                case 'instance-id': return '';
                case 'endpoint': return '';
                case 'login-server': return '';
                default: return '';
            }
        });

        await run();

        expect(OpenApi.default).toHaveBeenCalledWith(expect.objectContaining({
            endpoint: 'cr.cn-hangzhou.aliyuncs.com',
            protocol: 'HTTPS'
        }));
    });

    test('should fail when username and password are not provided', async () => {
        core.getInput.mockImplementation(() => '');

        await run();

        expect(core.setFailed).toHaveBeenCalledWith(
            'Action failed: username and password are required. Provide them directly or via access-key-id/access-key-secret.'
        );
    });
});
