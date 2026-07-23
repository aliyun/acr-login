class MockClient {
    constructor(config) {
        this.config = config;
    }
    async callApi() {}
}

class MockConfig {
    constructor(map) {
        Object.assign(this, map);
    }
}

class MockParams {
    constructor(map) {
        Object.assign(this, map);
    }
}

class MockOpenApiRequest {
    constructor(map) {
        Object.assign(this, map);
    }
}

const OpenApi = {
    default: jest.fn(),
    Config: MockConfig,
    Params: MockParams,
    OpenApiRequest: MockOpenApiRequest
};

OpenApi.default.mockImplementation((config) => new MockClient(config));

module.exports = OpenApi;
