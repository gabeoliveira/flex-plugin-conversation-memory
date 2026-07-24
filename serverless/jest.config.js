// Node-environment tests for the Twilio Function. Tests live in test/ (NOT in
// functions/) so twilio-run never deploys them as callable endpoints.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
};
