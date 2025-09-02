const core = require('@actions/core');

const ROAClient = require('@alicloud/pop-core').ROAClient;
const RPCClient = require('@alicloud/pop-core').RPCClient;
const {Docker} = require('@docker/actions-toolkit/lib/docker/docker');


function getAPIEndpoint(regionId) {
    return `https://cr.${regionId}.aliyuncs.com`
}

function getRegistryEndpoint(regionId) {
    return `https://registry.${regionId}.aliyuncs.com`
}

async function run() {
    let accessKeyId = core.getInput('access-key-id', { required: false });
    let accessKeySecret = core.getInput('access-key-secret', { required: false });
    let securityToken = core.getInput('security-token', { required: false });
    let username = core.getInput('username', { required: false });
    let password = core.getInput('password', { required: false });
    let regionId = core.getInput('region-id', { required: false });
    let instanceId = core.getInput('instance-id', { required: false });
    let loginServer = core.getInput('login-server', { required: false });
    let endpoint = getAPIEndpoint(regionId);

    if (accessKeyId.length > 0) {
        if (regionId.length === 0) {
            core.setFailed(`Action failed for region-id is missing`);
            return;
        }

        if (instanceId.length === 0) {

            if (loginServer.length === 0) {
                loginServer = getRegistryEndpoint(regionId)
            }

            console.log('Getting tokens for temp user by access key ...');
            let client = new ROAClient({
                accessKeyId,
                accessKeySecret,
                securityToken,
                endpoint: endpoint,
                apiVersion: '2016-06-07'
            });

            try {
                let result = await client.request('GET', '/tokens')
                username = result.data.tempUserName
                password = result.data.authorizationToken
            } catch (err) {
                core.setFailed(`Action failed to get authorization token with error: ${err}`);
                return;
            }
        } else {
            console.log(`Getting tokens for temp user by access key for instance ${instanceId} ...`);
            let client = new RPCClient({
                accessKeyId,
                accessKeySecret,
                securityToken,
                endpoint: endpoint,
                codes: ['success'], 
                apiVersion: '2018-12-01'
            });
            try {
                let result = await client.request("GetAuthorizationToken", {
                    InstanceId: instanceId,
                    RegionId: regionId
                });
                username = result.TempUsername
                password = result.AuthorizationToken
            } catch (err) {
                core.setFailed(`Action failed to get authorization token with error: ${err}`);
                return;
            }
        }
    }

    if (loginServer.length === 0) {
        loginServer = 'https://index.docker.io/v1/';
    }

    await Docker.getExecOutput(['login', '--password-stdin', '--username', `${username}`, `${loginServer}`], {
        ignoreReturnCode: true,
        silent: true,
        input: Buffer.from(`${password}`)
    }).then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
            throw new Error(res.stderr.trim());
        }
        core.info('Login Succeeded!');
    });
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