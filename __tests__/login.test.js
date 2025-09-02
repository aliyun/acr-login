const core = require('@actions/core');
const { ROAClient, RPCClient } = require('@alicloud/pop-core');
const { Docker } = require('@docker/actions-toolkit/lib/docker/docker');

// Mock the modules
jest.mock('@actions/core');
jest.mock('@alicloud/pop-core');
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
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Mock console.log
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    
    afterEach(() => {
        // Restore console.log
        jest.restoreAllMocks();
    });
    
    test('should fail when accessKeyId is provided but regionId is missing', async () => {
        // Arrange
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': 
                    return 'test-access-key-id';
                case 'region-id': 
                    return '';
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(core.setFailed).toHaveBeenCalledWith('Action failed for region-id is missing');
    });
    
    test('should use ROA client when accessKeyId and regionId are provided but instanceId is missing', async () => {
        // Arrange
        const mockResult = {
            data: {
                tempUserName: 'temp-user',
                authorizationToken: 'temp-token'
            }
        };
        
        const mockROAClient = {
            request: jest.fn().mockResolvedValue(mockResult)
        };
        
        ROAClient.mockImplementation(() => mockROAClient);
        
        Docker.getExecOutput.mockResolvedValue({
            stderr: '',
            exitCode: 0
        });
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': 
                    return 'test-access-key-id';
                case 'access-key-secret': 
                    return 'test-access-key-secret';
                case 'region-id': 
                    return 'cn-hangzhou';
                case 'instance-id': 
                    return '';
                case 'login-server': 
                    return '';
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(ROAClient).toHaveBeenCalledWith({
            accessKeyId: 'test-access-key-id',
            accessKeySecret: 'test-access-key-secret',
            securityToken: '',
            endpoint: 'https://cr.cn-hangzhou.aliyuncs.com',
            apiVersion: '2016-06-07'
        });
        
        expect(mockROAClient.request).toHaveBeenCalledWith('GET', '/tokens');
        
        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'temp-user', 'https://registry.cn-hangzhou.aliyuncs.com'],
            {
                ignoreReturnCode: true,
                silent: true,
                input: Buffer.from('temp-token')
            }
        );
        
        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });
    
    test('should use RPC client when accessKeyId, regionId, and instanceId are provided', async () => {
        // Arrange
        const mockResult = {
            TempUsername: 'temp-user',
            AuthorizationToken: 'temp-token'
        };
        
        const mockRPCClient = {
            request: jest.fn().mockResolvedValue(mockResult)
        };
        
        RPCClient.mockImplementation(() => mockRPCClient);
        
        Docker.getExecOutput.mockResolvedValue({
            stderr: '',
            exitCode: 0
        });
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': 
                    return 'test-access-key-id';
                case 'access-key-secret': 
                    return 'test-access-key-secret';
                case 'region-id': 
                    return 'cn-hangzhou';
                case 'instance-id': 
                    return 'cri-12345';
                case 'login-server': 
                    return '';  // Empty login server
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(RPCClient).toHaveBeenCalledWith({
            accessKeyId: 'test-access-key-id',
            accessKeySecret: 'test-access-key-secret',
            securityToken: '',
            endpoint: 'https://cr.cn-hangzhou.aliyuncs.com',
            codes: ['success'],
            apiVersion: '2018-12-01'
        });
        
        expect(mockRPCClient.request).toHaveBeenCalledWith("GetAuthorizationToken", {
            InstanceId: 'cri-12345',
            RegionId: 'cn-hangzhou'
        });
        
        // For RPC mode, loginServer should default to Docker Hub when empty
        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'temp-user', 'https://index.docker.io/v1/'],
            {
                ignoreReturnCode: true,
                silent: true,
                input: Buffer.from('temp-token')
            }
        );
        
        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });
    
    test('should use provided username and password when accessKeyId is not provided', async () => {
        // Arrange
        Docker.getExecOutput.mockResolvedValue({
            stderr: '',
            exitCode: 0
        });
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'username': 
                    return 'test-user';
                case 'password': 
                    return 'test-password';
                case 'login-server': 
                    return 'https://custom.registry.com';
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'test-user', 'https://custom.registry.com'],
            {
                ignoreReturnCode: true,
                silent: true,
                input: Buffer.from('test-password')
            }
        );
        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });
    
    test('should use default Docker Hub when no login-server is provided', async () => {
        // Arrange
        Docker.getExecOutput.mockResolvedValue({
            stderr: '',
            exitCode: 0
        });
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'username': 
                    return 'test-user';
                case 'password': 
                    return 'test-password';
                case 'login-server': 
                    return '';
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(Docker.getExecOutput).toHaveBeenCalledWith(
            ['login', '--password-stdin', '--username', 'test-user', 'https://index.docker.io/v1/'],
            {
                ignoreReturnCode: true,
                silent: true,
                input: Buffer.from('test-password')
            }
        );
        expect(core.info).toHaveBeenCalledWith('Login Succeeded!');
    });
    
    test('should fail when ROA client request fails', async () => {
        // Arrange
        const errorMessage = 'ROA client error';
        
        const mockROAClient = {
            request: jest.fn().mockRejectedValue(new Error(errorMessage))
        };
        
        ROAClient.mockImplementation(() => mockROAClient);
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': 
                    return 'test-access-key-id';
                case 'access-key-secret': 
                    return 'test-access-key-secret';
                case 'region-id': 
                    return 'cn-hangzhou';
                case 'instance-id': 
                    return '';
                case 'login-server':
                    return '';
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(core.setFailed).toHaveBeenCalledWith(`Action failed to get authorization token with error: Error: ${errorMessage}`);
    });
    
    test('should fail when RPC client request fails', async () => {
        // Arrange
        const errorMessage = 'RPC client error';
        
        const mockRPCClient = {
            request: jest.fn().mockRejectedValue(new Error(errorMessage))
        };
        
        RPCClient.mockImplementation(() => mockRPCClient);
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'access-key-id': 
                    return 'test-access-key-id';
                case 'access-key-secret': 
                    return 'test-access-key-secret';
                case 'region-id': 
                    return 'cn-hangzhou';
                case 'instance-id': 
                    return 'cri-12345';
                case 'login-server':
                    return '';
                default: 
                    return '';
            }
        });
        
        // Act
        await run();
        
        // Assert
        expect(core.setFailed).toHaveBeenCalledWith(`Action failed to get authorization token with error: Error: ${errorMessage}`);
    });
    
    test('should fail when Docker login fails', async () => {
        // Arrange
        const errorMessage = 'Docker login error';
        
        Docker.getExecOutput.mockResolvedValue({
            stderr: errorMessage,
            exitCode: 1
        });
        
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'username': 
                    return 'test-user';
                case 'password': 
                    return 'test-password';
                case 'login-server':
                    return 'https://custom.registry.com';
                default: 
                    return '';
            }
        });
        
        // Act & Assert
        await expect(run()).rejects.toThrow(errorMessage);
    });
});