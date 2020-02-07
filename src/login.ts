import * as core from '@actions/core';
import * as io from '@actions/io';
import { issueCommand } from '@actions/core/lib/command';
import * as path from 'path';
import * as fs from 'fs';
import ROAClient from '@alicloud/pop-core';


async function run() {
    let accessKeyId = core.getInput('access-key-id', { required: false });
    let accessKeySecret = core.getInput('access-key-secret', { required: false });
    let username = core.getInput('username', { required: false });
    let password = core.getInput('password', { required: false });
    let loginServer = core.getInput('login-server', { required: true });

    if (accessKeyId.length > 0) {
        console.log('Getting tokens for temp user by access key');

        var client = new ROAClient({
            accessKeyId,
            accessKeySecret,
            endpoint: loginServer,
            apiVersion: '2016-06-07'
        });

        try {
            let response = await client.request('GET', '/tokens')
            let result = response as any
            username = result.data.tempUserName
            password = result.data.tempUserName
            console.log(`temp username=${username}`);
            console.log(`temp password=${password}`);
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