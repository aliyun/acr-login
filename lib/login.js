"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const command_1 = require("@actions/core/lib/command");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const pop_core_1 = __importDefault(require("@alicloud/pop-core"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let accessKeyId = core.getInput('access-key-id', { required: false });
        let accessKeySecret = core.getInput('access-key-secret', { required: false });
        let username = core.getInput('username', { required: false });
        let password = core.getInput('password', { required: false });
        let loginServer = core.getInput('login-server', { required: true });
        if (accessKeyId.length > 0) {
            console.log('Getting tokens for temp user by access key');
            var client = new pop_core_1.default({
                accessKeyId,
                accessKeySecret,
                endpoint: loginServer,
                apiVersion: '2016-06-07'
            });
            try {
                let response = yield client.request('GET', '/tokens');
                let result = response;
                username = result.data.tempUserName;
                password = result.data.tempUserName;
                console.log(`temp username=${username}`);
                console.log(`temp password=${password}`);
            }
            catch (err) {
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
        };
        const runnerTempDirectory = process.env['RUNNER_TEMP']; // Using process.env until the core libs are updated
        const dirPath = path.join(runnerTempDirectory, `docker_login_${Date.now()}`);
        yield io.mkdirP(dirPath);
        const dockerConfigPath = path.join(dirPath, `config.json`);
        core.debug(`Writing docker config contents to ${dockerConfigPath}`);
        fs.writeFileSync(dockerConfigPath, JSON.stringify(config));
        command_1.issueCommand('set-env', { name: 'DOCKER_CONFIG' }, dirPath);
        console.log('DOCKER_CONFIG environment variable is set');
    });
}
run().catch(core.setFailed);
