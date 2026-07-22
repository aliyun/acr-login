const core = require('@actions/core');

const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');
const CR20181201 = require('@alicloud/cr20181201');
const { Docker } = require('@docker/actions-toolkit/lib/docker/docker');

const DEFAULT_REGISTRY_ENDPOINT = 'https://index.docker.io/v1/';

function getAPIEndpoint(regionId) {
    return `https://cr.${regionId}.aliyuncs.com`;
}

function getRegistryEndpoint(regionId) {
    return `https://registry.${regionId}.aliyuncs.com`;
}

function isBlank(str) {
    return !str || str.trim().length === 0;
}

/**
 * Strip protocol prefix from endpoint for SDK config.
 * SDK expects hostname only (e.g. "cr.cn-hangzhou.aliyuncs.com").
 */
function stripProtocol(endpoint) {
    return endpoint.replace(/^https?:\/\//, '');
}

async function getTempCredentialsWithROA({ accessKeyId, accessKeySecret, securityToken, endpoint }) {
    console.log('Getting tokens for temp user by access key ...');

    const config = new OpenApi.Config({
        accessKeyId,
        accessKeySecret,
        securityToken: securityToken || undefined,
        endpoint: stripProtocol(endpoint),
        protocol: 'HTTPS'
    });
    const client = new OpenApi.default(config);

    const params = new OpenApi.Params({
        action: 'GetAuthorizationToken',
        version: '2016-06-07',
        protocol: 'HTTPS',
        pathname: '/tokens',
        method: 'GET',
        authType: 'AK',
        style: 'ROA',
        reqBodyType: 'json',
        bodyType: 'json'
    });

    const request = new OpenApi.OpenApiRequest({});
    const runtime = new Util.RuntimeOptions({});

    const result = await client.callApi(params, request, runtime);
    return {
        username: result.body.data.tempUserName,
        password: result.body.data.authorizationToken
    };
}

async function getTempCredentialsWithRPC({ accessKeyId, accessKeySecret, securityToken, endpoint, instanceId }) {
    console.log(`Getting tokens for temp user by access key for instance ${instanceId} ...`);

    const config = new OpenApi.Config({
        accessKeyId,
        accessKeySecret,
        securityToken: securityToken || undefined,
        endpoint: stripProtocol(endpoint),
        protocol: 'HTTPS'
    });
    const client = new CR20181201.default(config);

    const request = new CR20181201.GetAuthorizationTokenRequest({
        instanceId
    });

    const result = await client.getAuthorizationToken(request);
    return {
        username: result.body.tempUsername,
        password: result.body.authorizationToken
    };
}

async function dockerLogin(username, password, loginServer) {
    const targetServer = isBlank(loginServer) ? DEFAULT_REGISTRY_ENDPOINT : loginServer;

    const res = await Docker.getExecOutput(
        ['login', '--password-stdin', '--username', username, targetServer],
        {
            ignoreReturnCode: true,
            silent: true,
            input: Buffer.from(password)
        }
    );

    if (res.stderr.length > 0 && res.exitCode !== 0) {
        throw new Error(res.stderr.trim());
    }

    core.info('Login Succeeded!');
}

async function run() {
    const accessKeyId = core.getInput('access-key-id', { required: false });
    const accessKeySecret = core.getInput('access-key-secret', { required: false });
    const securityToken = core.getInput('security-token', { required: false });
    const regionId = core.getInput('region-id', { required: false });
    const instanceId = core.getInput('instance-id', { required: false });
    const endpoint = core.getInput('endpoint', { required: false });

    let username = core.getInput('username', { required: false });
    let password = core.getInput('password', { required: false });
    let loginServer = core.getInput('login-server', { required: false });

    // If access key is provided, use it to get temporary credentials
    if (!isBlank(accessKeyId)) {
        if (isBlank(accessKeySecret)) {
            core.setFailed('Action failed: access-key-secret is required when access-key-id is provided');
            return;
        }

        if (isBlank(regionId)) {
            core.setFailed('Action failed: region-id is required when access-key-id is provided');
            return;
        }

        const apiEndpoint = isBlank(endpoint) ? getAPIEndpoint(regionId) : endpoint;

        try {
            let credentials;
            if (isBlank(instanceId)) {
                // Public ACR: use ROA style call (GET /tokens)
                const registryEndpoint = isBlank(loginServer) ? getRegistryEndpoint(regionId) : loginServer;
                credentials = await getTempCredentialsWithROA({
                    accessKeyId,
                    accessKeySecret,
                    securityToken,
                    endpoint: apiEndpoint
                });
                loginServer = registryEndpoint;
            } else {
                // Enterprise ACR: use RPC style call (GetAuthorizationToken)
                credentials = await getTempCredentialsWithRPC({
                    accessKeyId,
                    accessKeySecret,
                    securityToken,
                    endpoint: apiEndpoint,
                    instanceId
                });
                // For enterprise instance, loginServer defaults to Docker Hub
            }

            username = credentials.username;
            password = credentials.password;
        } catch (err) {
            core.setFailed(`Action failed to get authorization token: ${err.message}`);
            return;
        }
    }

    // Validate credentials are available before attempting login
    if (isBlank(username) || isBlank(password)) {
        core.setFailed('Action failed: username and password are required. Provide them directly or via access-key-id/access-key-secret.');
        return;
    }

    try {
        await dockerLogin(username, password, loginServer);
    } catch (err) {
        core.setFailed(`Docker login failed: ${err.message}`);
    }
}

// Only run immediately if not in a test environment
if (process.env.NODE_ENV !== 'test') {
    run().catch(e => core.setFailed(e));
}

// Export functions for testing
module.exports = {
    getAPIEndpoint,
    getRegistryEndpoint,
    run
};
