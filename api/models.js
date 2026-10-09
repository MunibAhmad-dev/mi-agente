const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');

const methods = createMethods(mongoose);

// `seedDatabase` is called in startServer() to initialize default roles/perms.
// In this architecture it maps to `initializeRoles` from createMethods.
module.exports = {
  ...methods,
  seedDatabase: methods.initializeRoles,
};
