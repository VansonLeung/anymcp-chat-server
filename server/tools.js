const toolDefinitions = require('./tools-definitions/imports') || [];

function getToolDefinitions() {
    return toolDefinitions;
};

function getToolDefinition(name) {
  return toolDefinitions.find(tool => tool.name === name);
}

module.exports = {
    getToolDefinition,
    getToolDefinitions,
};
