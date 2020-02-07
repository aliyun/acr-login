const core = require('@actions/core');
const io = require('@actions/io');
const { issueCommand } = require('@actions/core/lib/command');

const path = require('path');
const fs = require('fs');
const { ROAClient } = require('@alicloud/pop-core');

async function run() {
    let accessKeyId = core.getInput('access-key-id', { required: false });
    let accessKeySecret = core.getInput('access-key-secret', { required: false });
    let username = core.getInput('username', { required: false });
    let password = core.getInput('password', { required: false });
    let loginServer = core.getInput('login-server', { required: true });

    if (accessKeyId.length > 0) {
        console.log('Getting tokens for temp user by access key ...');

        var client = new ROAClient({
            accessKeyId,
            accessKeySecret,
            endpoint: loginServer,
            apiVersion: '2016-06-07'
        });

        try {
            let response = await client.request('GET', '/tokens')
            let result = response;
            username = result.data.tempUserName
            password = result.data.authorizationToken
        } catch (err) {
            core.setFailed(`Action failed to get with error ${err}`);
        }
    }

    let authenticationToken = Buffer.from(`${username}:${password}`).toString('base64');

    let config = {
        "auths": {
            [loginServer]: {
                auth: authenticationToken
            }
        }
    }

    const runnerTempDirectory = process.env['RUNNER_TEMP']; // Using process.env until the core libs are updated
    const dirPath = path.join(runnerTempDirectory, `docker_login_${Date.now()}`);
    await io.mkdirP(dirPath);
    const dockerConfigPath = path.join(dirPath, `config.json`);
    core.debug(`Writing docker config contents to ${dockerConfigPath}`);
    fs.writeFileSync(dockerConfigPath, JSON.stringify(config));
    issueCommand('set-env', { name: 'DOCKER_CONFIG' }, dirPath);
    console.log('DOCKER_CONFIG environment variable is set');
}

run().catch(core.setFailed);