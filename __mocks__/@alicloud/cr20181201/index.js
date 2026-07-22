class MockClient {
    constructor(config) {
        this.config = config;
    }
    async getAuthorizationToken() {}
}

class MockGetAuthorizationTokenRequest {
    constructor(map) {
        Object.assign(this, map);
    }
    validate() {}
}

const CR20181201 = {
    default: jest.fn(),
    GetAuthorizationTokenRequest: MockGetAuthorizationTokenRequest
};

CR20181201.default.mockImplementation((config) => new MockClient(config));

module.exports = CR20181201;
